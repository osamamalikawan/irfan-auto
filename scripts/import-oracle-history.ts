/**
 * Imports historical Oracle invoices, purchases, returns, and payment history without changing current stock.
 *
 *   npm run import:oracle:history -- path/to/dump.sql-or-folder           preview only
 *   npm run import:oracle:history -- path/to/dump.sql-or-folder --apply   import history
 */
import { createHash } from "node:crypto";
import { streamOracleDump, type Row, type Val } from "../lib/oracle-dump";
import { buildPlan } from "../lib/oracle-plan";
import { DEFAULT_CONFIG } from "../lib/oracle-map";

const args = process.argv.slice(2);
const file = args.find((arg) =>
  !arg.startsWith("--") && arg !== "apply" &&
  arg !== "customer-payments-only" && arg !== "sales-returns-only" && arg !== "customer-discounts-only" &&
  arg !== "customer-phones-only" && arg !== "routes-only" && arg !== "areas-only" &&
  arg !== "supplier-payments-only"
);
const apply = args.includes("--apply") || args.includes("apply");
const customerPaymentsOnly = args.includes("--customer-payments-only") || args.includes("customer-payments-only");
const salesReturnsOnly = args.includes("--sales-returns-only") || args.includes("sales-returns-only");
const customerDiscountsOnly = args.includes("--customer-discounts-only") || args.includes("customer-discounts-only");
const customerPhonesOnly = args.includes("--customer-phones-only") || args.includes("customer-phones-only");
const routesOnly = args.includes("--routes-only") || args.includes("routes-only");
const areasOnly = args.includes("--areas-only") || args.includes("areas-only");
const supplierPaymentsOnly = args.includes("--supplier-payments-only") || args.includes("supplier-payments-only");
if ([customerPaymentsOnly, salesReturnsOnly, customerDiscountsOnly, customerPhonesOnly, routesOnly, areasOnly, supplierPaymentsOnly].filter(Boolean).length > 1) {
  console.error("Choose only one import scope.");
  process.exit(1);
}
if (!file) {
  console.error("Usage: npm run import:oracle:history -- <dump.sql|dump-folder> [--customer-payments-only | --supplier-payments-only | --sales-returns-only | --customer-discounts-only | --customer-phones-only | --routes-only | --areas-only] [apply]");
  process.exit(1);
}

const TABLES = ["CUST", "CUST2", "PROD", "INV0S", "INV1S", "INV0P", "INV1P", "CASHR1", "CASHP1", "CASH_REC0", "CASH_REC1", "CASHD1", "INVR0", "INVR1"];
const chunks = <T,>(rows: T[], size = 500) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
const check = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(label + ": " + error.message);
};
const isNetworkError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH/i.test(message);
};
async function retryNetworkWrite(
  label: string,
  write: () => PromiseLike<{ error: { message: string } | null }>
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await write();
      if (!error) return;
      if (!isNetworkError(error)) check(label, error);
      lastError = error;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      lastError = error;
    }
    if (attempt < 3) {
      console.warn(`${label}: network error; retrying batch (${attempt}/3)`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  const detail = lastError instanceof Error
    ? lastError.message
    : lastError && typeof lastError === "object" && "message" in lastError
      ? String(lastError.message)
      : String(lastError);
  throw new Error(`${label}: network write failed after 3 attempts: ${detail}`);
}
const value = (row: Row, key: string): Val => row[key] ?? null;
const number = (row: Row, key: string) => {
  const n = Number(row[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const legacyId = (row: Row, key: string): number | null => {
  const raw = row[key];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
};
const text = (raw: Val): string | null => {
  if (raw == null) return null;
  const result = String(raw).trim();
  return result || null;
};
const date = (raw: Val): string | null => {
  const match = raw == null ? null : /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(String(raw));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};
const timestamp = (day: string) => new Date(`${day}T12:00:00+05:00`).toISOString();
const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const key = (table: string, sourceId: number) => `oracle:${table}:${sourceId}`;
const uuid = (namespace: string, sourceKey: string) => {
  const bytes = createHash("sha256").update(`${namespace}:${sourceKey}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

type LineTotals = { count: number; gross: number; discount: number; invalid: number };
type Summary = {
  customers: Row[];
  customerPhones: Row[];
  routes: Row[];
  cities: Row[];
  customerPlan: ReturnType<typeof buildPlan>["customers"];
  productCodes: Set<number>;
  sales: Row[];
  purchases: Row[];
  receipts: Row[];
  customerDiscounts: Row[];
  receiptBatches: Map<number, Row>;
  receiptBatchRows: Row[];
  supplierPayments: Row[];
  saleReturns: Row[];
  saleReturnLines: Map<number, Row[]>;
  saleLines: Map<number, LineTotals>;
  purchaseLines: Map<number, LineTotals>;
  duplicateSales: Set<number>;
  duplicatePurchases: Set<number>;
  duplicateReturns: Set<number>;
  counts: Record<string, number>;
};

type Supabase = ReturnType<typeof import("../lib/supabase").db>;

function totalsFor(map: Map<number, LineTotals>, id: number) {
  let totals = map.get(id);
  if (!totals) {
    totals = { count: 0, gross: 0, discount: 0, invalid: 0 };
    map.set(id, totals);
  }
  return totals;
}

async function readSummary(path: string, productIds?: Set<number>, tables = TABLES): Promise<Summary> {
  const summary: Summary = {
    customers: [],
    customerPhones: [],
    routes: [],
    cities: [],
    customerPlan: [],
    productCodes: new Set(),
    sales: [],
    purchases: [],
    receipts: [],
    customerDiscounts: [],
    receiptBatches: new Map(),
    receiptBatchRows: [],
    supplierPayments: [],
    saleReturns: [],
    saleReturnLines: new Map(),
    saleLines: new Map(),
    purchaseLines: new Map(),
    duplicateSales: new Set(),
    duplicatePurchases: new Set(),
    duplicateReturns: new Set(),
    counts: Object.fromEntries(tables.map((table) => [table, 0])),
  };
  const saleHeaders = new Set<number>();
  const purchaseHeaders = new Set<number>();
  const returnHeaders = new Set<number>();

  for await (const { table, row } of streamOracleDump(path, tables)) {
    summary.counts[table]++;
    if (table === "CUST") {
      summary.customers.push(row);
      continue;
    }
    if (table === "CUST2") {
      summary.customerPhones.push(row);
      continue;
    }
    if (table === "ROUTE") {
      summary.routes.push(row);
      continue;
    }
    if (table === "CITY") {
      summary.cities.push(row);
      continue;
    }
    if (table === "PROD") {
      const code = legacyId(row, "PCODE");
      if (code != null) summary.productCodes.add(code);
      continue;
    }
    if (table === "INV0S") {
      const id = legacyId(row, "INVNO");
      if (id == null) continue;
      if (saleHeaders.has(id)) summary.duplicateSales.add(id);
      saleHeaders.add(id);
      summary.sales.push(row);
      continue;
    }
    if (table === "INV0P") {
      const id = legacyId(row, "INVNO");
      if (id == null) continue;
      if (purchaseHeaders.has(id)) summary.duplicatePurchases.add(id);
      purchaseHeaders.add(id);
      summary.purchases.push(row);
      continue;
    }
    if (table === "CASHR1") {
      summary.receipts.push(row);
      continue;
    }
    if (table === "CASHD1") {
      summary.customerDiscounts.push(row);
      continue;
    }
    if (table === "CASH_REC0") {
      const id = legacyId(row, "CASHNO");
      if (id != null) summary.receiptBatches.set(id, row);
      continue;
    }
    if (table === "CASH_REC1") {
      summary.receiptBatchRows.push(row);
      continue;
    }
    if (table === "CASHP1") {
      summary.supplierPayments.push(row);
      continue;
    }
    if (table === "INVR0") {
      const id = legacyId(row, "INVNO");
      if (id == null) continue;
      if (returnHeaders.has(id)) summary.duplicateReturns.add(id);
      returnHeaders.add(id);
      summary.saleReturns.push(row);
      continue;
    }
    if (table === "INVR1") {
      const id = legacyId(row, "INVNO");
      if (id == null) continue;
      const lines = summary.saleReturnLines.get(id) ?? [];
      lines.push(row);
      summary.saleReturnLines.set(id, lines);
      continue;
    }

    const id = legacyId(row, "INVNO");
    const map = table === "INV1S" ? summary.saleLines : summary.purchaseLines;
    if (id == null) continue;
    const line = totalsFor(map, id);
    line.count++;
    const qty = number(row, "QTY");
    const price = roundMoney(number(row, "UPRICE"));
    const lineDiscount = roundMoney(number(row, "DISC"));
    if (qty <= 0 || legacyId(row, "PCODE") == null || (productIds && !productIds.has(legacyId(row, "PCODE")!))) {
      line.invalid++;
    }
    line.gross += qty * price;
    line.discount += lineDiscount;
  }

  const plan = buildPlan({ CUST: summary.customers, PROD: [] }, DEFAULT_CONFIG);
  summary.customerPlan = plan.customers;
  return summary;
}

function paymentTotal(row: Row, fields: string[]) {
  return roundMoney(fields.reduce((total, field) => total + Math.max(0, number(row, field)), 0));
}

function receiptSheetAmount(row: Row) {
  return paymentTotal(row, ["AMT", "AMT3", "AMT4", "AMT5"]);
}

function receiptKey(customerCode: number, day: string, amount: number) {
  return `${customerCode}|${day}|${roundMoney(amount).toFixed(2)}`;
}

function flagsNote(row: Row) {
  const names = ["FLAG2", "ISPENDING", "HIDEME", "RETURN2"];
  const flags = names.filter((name) => String(row[name] ?? "").toUpperCase() === "Y");
  return flags.length ? `Legacy flags: ${flags.join(", ")}` : null;
}

function customerReceipts(
  summary: Summary,
  customerIds: Map<number, string>,
  sourceCustomers: Map<number, Row>
) {
  const invalid = { direct: 0, sheet: 0 };
  const direct = summary.receipts.filter((row) => {
    const code = legacyId(row, "CCODE");
    if (legacyId(row, "CASHNO") == null || code == null || !customerIds.has(code) ||
      !sourceCustomers.has(code) || number(row, "AMT") <= 0 || !date(value(row, "CASHDATED"))) {
      invalid.direct++;
      return false;
    }
    return true;
  });
  const remainingDirectReceiptCounts = new Map<string, number>();
  for (const row of direct) {
    const receipt = receiptKey(legacyId(row, "CCODE")!, date(value(row, "CASHDATED"))!, number(row, "AMT"));
    remainingDirectReceiptCounts.set(receipt, (remainingDirectReceiptCounts.get(receipt) ?? 0) + 1);
  }
  let duplicateSheetRows = 0;
  const sheet = summary.receiptBatchRows.flatMap((row) => {
    const batchId = legacyId(row, "CASHNO");
    const lineId = legacyId(row, "SNO");
    const customerCode = legacyId(row, "CCODE");
    const batch = batchId == null ? undefined : summary.receiptBatches.get(batchId);
    const day = batch ? date(value(batch, "CASHDATED")) : null;
    const amount = receiptSheetAmount(row);
    if (batchId == null || lineId == null || customerCode == null || !day || amount <= 0 ||
      !customerIds.has(customerCode) || !sourceCustomers.has(customerCode)) {
      invalid.sheet++;
      return [];
    }
    const match = receiptKey(customerCode, day, amount);
    const directCount = remainingDirectReceiptCounts.get(match) ?? 0;
    if (directCount > 0) {
      remainingDirectReceiptCounts.set(match, directCount - 1);
      duplicateSheetRows++;
      return [];
    }
    return [{ row, batchId, lineId, customerCode, customerId: customerIds.get(customerCode)!, day, amount }];
  });
  return { direct, sheet, duplicateSheetRows, invalid };
}

function legacyReturnLineAmount(row: Row) {
  const quantity = number(row, "QTY");
  const price = number(row, "UPRICE");
  const discountPercent = Math.max(0, number(row, "DISC_PCENT"));
  const lineDiscount = Math.max(0, number(row, "DISC")) + Math.max(0, number(row, "SCHDISC"));
  return roundMoney(Math.max(0, quantity * price * (1 - discountPercent / 100) - lineDiscount));
}

async function importOracleReturns(
  client: Supabase,
  summary: Summary,
  sourceSales: Row[],
  customerIds: Map<number, string>,
  productByCode: Map<number, { id: string; name_en: string }>
) {
  type ReturnPlan = {
    sourceId: number;
    row: Row;
    customerId: string;
    day: string;
    amount: number;
    sourceLines: Row[];
  };
  type SaleItem = {
    id: string;
    productId: string;
    pcode: number;
    name: string;
    qty: number;
    lineNo: number;
  };
  type AllocatedLine = { item: SaleItem; qty: number; amount: number };
  const plans: ReturnPlan[] = [];
  let invalid = 0;
  for (const row of summary.saleReturns) {
    const sourceId = legacyId(row, "INVNO");
    const customerCode = legacyId(row, "CCODE");
    const customerId = customerCode == null ? undefined : customerIds.get(customerCode);
    const day = date(value(row, "INVDATE"));
    const sourceLines = sourceId == null ? [] : summary.saleReturnLines.get(sourceId) ?? [];
    const amount = roundMoney(sourceLines.reduce((total, line) => total + legacyReturnLineAmount(line), 0));
    if (sourceId == null || summary.duplicateReturns.has(sourceId) || !customerId || !day || !sourceLines.length || amount <= 0) {
      invalid++;
      continue;
    }
    plans.push({ sourceId, row, customerId, day, amount, sourceLines });
  }

  const importedSales = new Map<number, { customerId: string; day: string }>();
  for (const row of sourceSales) {
    const sourceId = legacyId(row, "INVNO");
    const customerCode = legacyId(row, "CCODE");
    const customerId = customerCode == null ? undefined : customerIds.get(customerCode);
    const day = date(value(row, "INVDATE"));
    if (sourceId != null && customerId && day) importedSales.set(sourceId, { customerId, day });
  }
  const possibleSalesByReturn = new Map<number, number[]>();
  const productsBySale = new Map<number, Set<number>>();
  for (const plan of plans) {
    const returnProducts = new Set<number>();
    let everyLineMappable = true;
    for (const line of plan.sourceLines) {
      const pcode = legacyId(line, "PCODE");
      if (pcode == null || !productByCode.has(pcode) || number(line, "QTY") <= 0) {
        everyLineMappable = false;
        break;
      }
      returnProducts.add(pcode);
    }
    if (!everyLineMappable) continue;
    const candidates: number[] = [];
    for (const [saleId, sale] of importedSales) {
      if (sale.customerId !== plan.customerId || sale.day > plan.day) continue;
      candidates.push(saleId);
      const products = productsBySale.get(saleId) ?? new Set<number>();
      for (const pcode of returnProducts) products.add(pcode);
      productsBySale.set(saleId, products);
    }
    possibleSalesByReturn.set(plan.sourceId, candidates);
  }

  const sourceSaleItems = new Map<number, SaleItem[]>();
  const saleLineNumbers = new Map<number, number>();
  for await (const { table, row } of streamOracleDump(file!, ["INV1S"])) {
    if (table !== "INV1S") continue;
    const sourceId = legacyId(row, "INVNO");
    const pcode = legacyId(row, "PCODE");
    if (sourceId == null || pcode == null || !productsBySale.has(sourceId)) continue;
    const product = productByCode.get(pcode);
    if (!product) continue;
    const lineNo = (saleLineNumbers.get(sourceId) ?? 0) + 1;
    saleLineNumbers.set(sourceId, lineNo);
    if (!productsBySale.get(sourceId)!.has(pcode)) continue;
    const items = sourceSaleItems.get(sourceId) ?? [];
    items.push({
      id: uuid("sale-item", `${sourceId}:${lineNo}`),
      productId: product.id,
      pcode,
      name: product.name_en,
      qty: number(row, "QTY"),
      lineNo,
    });
    sourceSaleItems.set(sourceId, items);
  }

  const candidateItemIds = [...new Set([...sourceSaleItems.values()].flat().map((item) => item.id))];
  const ownReturnIds = new Set(plans.map((plan) => uuid("sale-return", String(plan.sourceId))));
  const otherReturnQty = new Map<string, number>();
  for (const itemIds of chunks(candidateItemIds, 250)) {
    const { data, error } = await client
      .from("sale_return_lines")
      .select("return_id,sale_item_id,qty")
      .in("sale_item_id", itemIds);
    check("sale_return_lines", error);
    for (const line of data ?? []) {
      if (ownReturnIds.has(line.return_id)) continue;
      otherReturnQty.set(line.sale_item_id, (otherReturnQty.get(line.sale_item_id) ?? 0) + Number(line.qty));
    }
  }
  const remainingQty = new Map<string, number>();
  for (const items of sourceSaleItems.values()) {
    for (const item of items) {
      remainingQty.set(item.id, Math.max(0, item.qty - (otherReturnQty.get(item.id) ?? 0)));
    }
  }

  const returnRows: Record<string, unknown>[] = [];
  const returnLineRows: Record<string, unknown>[] = [];
  const ledgerRows: Record<string, unknown>[] = [];
  const linkedSourceSaleIds = new Set<number>();
  const return2Sources = sourceSales.filter((row) => String(row.RETURN2 ?? "").toUpperCase() === "Y");
  let return2Imported = 0;
  let return2SkippedWithoutLines = 0;
  const return2Sales = new Map<number, { id: string; customerId: string; day: string; total: number }>();
  for (const batch of chunks(return2Sources.map((row) => legacyId(row, "INVNO")).filter((id): id is number => id != null), 250)) {
    const { data, error } = await client
      .from("sales")
      .select("id,idem_key,customer_id,sale_date,total")
      .in("idem_key", batch.map((id) => key("INV0S", id)));
    check("sales", error);
    for (const sale of data ?? []) {
      const sourceId = Number(sale.idem_key.slice("oracle:INV0S:".length));
      if (Number.isSafeInteger(sourceId)) {
        return2Sales.set(sourceId, {
          id: sale.id,
          customerId: sale.customer_id,
          day: String(sale.sale_date),
          total: Number(sale.total),
        });
        linkedSourceSaleIds.add(sourceId);
      }
    }
  }
  const return2SaleIds = [...return2Sales.values()].map((sale) => sale.id);
  const return2Items: {
    id: string;
    sale_id: string;
    product_id: string;
    name: string;
    qty: number;
    price: number;
    line_disc: number;
  }[] = [];
  for (const batch of chunks(return2SaleIds, 100)) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client
        .from("sale_items")
        .select("id,sale_id,product_id,name,qty,price,line_disc")
        .in("sale_id", batch)
        .order("id")
        .range(from, from + 999);
      check("sale_items", error);
      return2Items.push(...(data ?? []).map((item) => ({
        ...item,
        qty: Number(item.qty),
        price: Number(item.price),
        line_disc: Number(item.line_disc),
      })));
      if (!data || data.length < 1000) break;
    }
  }
  const return2ItemsBySale = new Map<string, typeof return2Items>();
  const distinctReturn2Items = [...new Map(return2Items.map((item) => [item.id, item])).values()];
  for (const item of distinctReturn2Items) {
    const items = return2ItemsBySale.get(item.sale_id) ?? [];
    items.push(item);
    return2ItemsBySale.set(item.sale_id, items);
  }
  const ownReturn2Ids = new Set([...return2Sales.keys()].map((sourceId) => uuid("sale-return-return2", String(sourceId))));
  const return2ItemIds = distinctReturn2Items.map((item) => item.id);
  const alreadyReturnedQty = new Map<string, number>();
  const return2ExistingLineIds = new Map<string, string>();
  for (const batch of chunks(return2ItemIds, 100)) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client
        .from("sale_return_lines")
        .select("id,return_id,sale_item_id,qty")
        .in("sale_item_id", batch)
        .order("id")
        .range(from, from + 999);
      check("sale_return_lines", error);
      for (const line of data ?? []) {
        if (ownReturn2Ids.has(line.return_id)) {
          return2ExistingLineIds.set(`${line.return_id}:${line.sale_item_id}`, line.id);
          continue;
        }
        alreadyReturnedQty.set(line.sale_item_id, (alreadyReturnedQty.get(line.sale_item_id) ?? 0) + Number(line.qty));
      }
      if (!data || data.length < 1000) break;
    }
  }
  for (const source of return2Sources) {
    const sourceId = legacyId(source, "INVNO");
    const sale = sourceId == null ? undefined : return2Sales.get(sourceId);
    if (sourceId == null || !sale) continue;
    const items = return2ItemsBySale.get(sale.id) ?? [];
    if (!items.length) {
      return2SkippedWithoutLines++;
      continue;
    }
    const lineWeights = items.map((item) => {
      const qty = Math.max(0, item.qty - (alreadyReturnedQty.get(item.id) ?? 0));
      const discount = item.qty > 0 ? item.line_disc * qty / item.qty : 0;
      return { item, qty, weight: Math.max(0, qty * item.price - discount) };
    }).filter((line) => line.qty > 0);
    const totalWeight = lineWeights.reduce((total, line) => total + line.weight, 0);
    const remainingQty = lineWeights.reduce((total, line) => total + line.qty, 0);
    const sourceQty = items.reduce((total, item) => total + item.qty, 0);
    if (!lineWeights.length || remainingQty <= 0 || sourceQty <= 0) {
      return2SkippedWithoutLines++;
      continue;
    }
    const originalWeight = items.reduce((total, item) => total + Math.max(0, item.qty * item.price - item.line_disc), 0);
    const amount = roundMoney(sale.total * (originalWeight > 0 ? totalWeight / originalWeight : remainingQty / sourceQty));
    if (amount <= 0) {
      return2SkippedWithoutLines++;
      continue;
    }

    const returnId = uuid("sale-return-return2", String(sourceId));
    const reason = text(value(source, "REMARKS"));
    const isClaim = /claim/i.test(reason ?? "");
    let remainingAmount = amount;
    const weightBasis = totalWeight || remainingQty;
    const lineRows = lineWeights.map((line, index) => {
      const weight = totalWeight ? line.weight : line.qty;
      const lineAmount = index === lineWeights.length - 1
        ? remainingAmount
        : roundMoney(amount * weight / weightBasis);
      remainingAmount = roundMoney(remainingAmount - lineAmount);
      return {
        id: return2ExistingLineIds.get(`${returnId}:${line.item.id}`) ??
          uuid("sale-return-line-return2", `${sourceId}:${line.item.id}`),
        return_id: returnId,
        sale_item_id: line.item.id,
        product_id: line.item.product_id,
        name: line.item.name,
        qty: line.qty,
        amount: lineAmount,
      };
    });
    const lineAmount = roundMoney(lineRows.reduce((total, line) => total + Number(line.amount), 0));
    returnRows.push({
      id: returnId,
      no: `OLD-RET-INV-${sourceId}`,
      sale_id: sale.id,
      return_date: sale.day,
      amount: lineAmount,
      damaged: isClaim,
      kind: isClaim ? "claim" : "return",
      reason: reason ?? `Imported Oracle INV0S RETURN2 invoice ${sourceId}`,
      created_at: timestamp(sale.day),
    });
    returnLineRows.push(...lineRows);
    ledgerRows.push({
      id: uuid("customer-ledger-return-return2", String(sourceId)),
      customer_id: sale.customerId,
      type: "return",
      amount: -lineAmount,
      ref: returnId,
      entry_date: sale.day,
      ts: timestamp(sale.day),
      note: `Imported from Oracle INV0S RETURN2 invoice ${sourceId}${reason ? ` | ${reason}` : ""}`,
    });
    return2Imported++;
  }
  let linked = 0;
  const orderedPlans = [...plans].sort((a, b) => a.day.localeCompare(b.day) || a.sourceId - b.sourceId);
  for (const plan of orderedPlans) {
    let canLink = true;
    for (const line of plan.sourceLines) {
      const pcode = legacyId(line, "PCODE");
      if (pcode == null || !productByCode.has(pcode) || number(line, "QTY") <= 0) {
        canLink = false;
        break;
      }
    }

    const matches: { saleId: number; allocated: AllocatedLine[]; remaining: Map<string, number> }[] = [];
    if (canLink) {
      for (const saleId of possibleSalesByReturn.get(plan.sourceId) ?? []) {
        const items = sourceSaleItems.get(saleId) ?? [];
        const candidateRemaining = new Map(items.map((item) => [item.id, remainingQty.get(item.id) ?? 0]));
        const allocated: AllocatedLine[] = [];
        let valid = true;
        for (const line of plan.sourceLines) {
          const pcode = legacyId(line, "PCODE")!;
          let quantityLeft = number(line, "QTY");
          const lineAmount = legacyReturnLineAmount(line);
          let amountLeft = lineAmount;
          const matchingItems = items.filter((item) => item.pcode === pcode).sort((a, b) => a.lineNo - b.lineNo);
          for (let index = 0; index < matchingItems.length && quantityLeft > 0; index++) {
            const item = matchingItems[index];
            const take = Math.min(quantityLeft, candidateRemaining.get(item.id) ?? 0);
            if (take <= 0) continue;
            const isLast = take >= quantityLeft;
            const amount = isLast ? amountLeft : roundMoney(lineAmount * take / number(line, "QTY"));
            allocated.push({ item, qty: take, amount });
            candidateRemaining.set(item.id, (candidateRemaining.get(item.id) ?? 0) - take);
            quantityLeft = roundMoney(quantityLeft - take);
            amountLeft = roundMoney(amountLeft - amount);
          }
          if (quantityLeft > 0) {
            valid = false;
            break;
          }
        }
        if (valid) matches.push({ saleId, allocated, remaining: candidateRemaining });
      }
    }

    let linkedSaleId: number | null = null;
    let linkedLines: AllocatedLine[] = [];
    if (matches.length === 1) {
      linkedSaleId = matches[0].saleId;
      linkedLines = matches[0].allocated;
      for (const [itemId, qty] of matches[0].remaining) remainingQty.set(itemId, qty);
      linked++;
      linkedSourceSaleIds.add(linkedSaleId);
      const returnId = uuid("sale-return", String(plan.sourceId));
      const lineRows = linkedLines.map((line, index) => ({
        id: uuid("sale-return-line", `${plan.sourceId}:${index + 1}`),
        return_id: returnId,
        sale_item_id: line.item.id,
        product_id: line.item.productId,
        name: line.item.name,
        qty: line.qty,
        amount: line.amount,
      }));
      returnRows.push({
        id: returnId,
        no: `OLD-RET-${plan.sourceId}`,
        sale_id: uuid("sale", String(linkedSaleId)),
        return_date: plan.day,
        amount: plan.amount,
        damaged: false,
        kind: "return",
        reason: text(value(plan.row, "REMARKS")) ?? `Imported from Oracle INVR0 return ${plan.sourceId}`,
        created_at: timestamp(plan.day),
      });
      returnLineRows.push(...lineRows);
    }

    const returnId = uuid("sale-return", String(plan.sourceId));
    ledgerRows.push({
      id: uuid("customer-ledger-return", String(plan.sourceId)),
      customer_id: plan.customerId,
      type: "return",
      amount: -plan.amount,
      ref: returnId,
      entry_date: plan.day,
      ts: timestamp(plan.day),
      note: [
        `Imported from Oracle INVR0 return ${plan.sourceId}`,
        ...(linkedSaleId == null ? ["Original invoice could not be matched unambiguously"] : []),
        text(value(plan.row, "REMARKS")),
      ].filter(Boolean).join(" | "),
    });
  }

  const saleKeys = [...linkedSourceSaleIds].map((saleId) => key("INV0S", saleId));
  const existingSaleKeys = new Set<string>();
  for (const batch of chunks(saleKeys, 250)) {
    const { data, error } = await client.from("sales").select("idem_key").in("idem_key", batch);
    check("sales", error);
    for (const sale of data ?? []) if (sale.idem_key) existingSaleKeys.add(sale.idem_key);
  }
  for (const saleId of linkedSourceSaleIds) {
    if (!existingSaleKeys.has(key("INV0S", saleId))) {
      throw new Error(`Cannot import Oracle returns: linked sale ${saleId} is missing. Import sales history first.`);
    }
  }
  const linkedItemIds = [...new Set(returnLineRows.map((line) => String(line.sale_item_id)))];
  const existingItemIds = new Set<string>();
  for (const batch of chunks(linkedItemIds, 250)) {
    const { data, error } = await client.from("sale_items").select("id").in("id", batch);
    check("sale_items", error);
    for (const item of data ?? []) existingItemIds.add(item.id);
  }
  const missingItemId = linkedItemIds.find((id) => !existingItemIds.has(id));
  if (missingItemId) throw new Error(`Cannot import Oracle returns: linked sale item ${missingItemId} is missing. Import sales history first.`);

  for (const batch of chunks(returnRows, 250)) {
    await retryNetworkWrite("sale_returns", () => client.from("sale_returns").upsert(batch, { onConflict: "id" }));
  }
  const returnLineIds = new Set<string>();
  for (const line of returnLineRows) {
    const id = String(line.id);
    if (returnLineIds.has(id)) throw new Error(`Duplicate generated sale_return_lines id ${id}; refusing to write ambiguous return items.`);
    returnLineIds.add(id);
  }
  for (const batch of chunks(returnLineRows, 250)) {
    await retryNetworkWrite("sale_return_lines", () => client.from("sale_return_lines").upsert(batch, { onConflict: "id" }));
  }
  for (const batch of chunks(ledgerRows, 250)) {
    await retryNetworkWrite("customer_ledger", () => client.from("customer_ledger").upsert(batch, { onConflict: "id" }));
  }
  console.log([
    `Imported explicit Oracle INVR0 returns: ${plans.length}`,
    `Imported Oracle INV0S returns (RETURN2 = Y): ${return2Imported}`,
    `RETURN2 invoices flagged in the dump but not imported as sales: ${summary.sales.filter((row) => String(row.RETURN2 ?? "").toUpperCase() === "Y").length - return2Sales.size}`,
    `RETURN2 sales skipped because their items were missing or already fully returned: ${return2SkippedWithoutLines}`,
    `Linked explicit INVR0 returns to an unambiguous original sale: ${linked}`,
    `Recorded in customer ledger without a sale link: ${plans.length - linked}`,
    `Skipped invalid or unmapped return headers: ${invalid}`,
    "Historical returns were inserted directly; no stock movements were changed.",
  ].join("\n"));
}

async function importOraclePurchaseReturnCredits(
  client: Supabase,
  summary: Summary,
  customerIds: Map<number, string>,
  productByCode: Map<number, { id: string; name_en: string }>
) {
  const sourceCustomerCodes = new Set(summary.customers.flatMap((row) => {
    const code = legacyId(row, "CCODE");
    const name = text(value(row, "CNAME"));
    return code != null && name && String(row.CODE ?? "").toUpperCase() === "C" &&
      String(row.GODOWN ?? "").toUpperCase() !== "Y" ? [code] : [];
  }));
  const flagged = summary.purchases.filter((row) => String(row.RETURN2 ?? "").toUpperCase() === "Y");
  const eligible = flagged.filter((row) => {
    const customerCode = legacyId(row, "CCODE");
    return customerCode != null && sourceCustomerCodes.has(customerCode) && customerIds.has(customerCode);
  });
  const invoiceIds = new Set(eligible.flatMap((row) => {
    const sourceId = legacyId(row, "INVNO");
    return sourceId == null || summary.duplicatePurchases.has(sourceId) ? [] : [sourceId];
  }));
  const linesByInvoice = new Map<number, Row[]>();
  for await (const { table, row } of streamOracleDump(file!, ["INV1P"])) {
    if (table !== "INV1P") continue;
    const sourceId = legacyId(row, "INVNO");
    if (sourceId == null || !invoiceIds.has(sourceId)) continue;
    const lines = linesByInvoice.get(sourceId) ?? [];
    lines.push(row);
    linesByInvoice.set(sourceId, lines);
  }

  const ledgerRows: Record<string, unknown>[] = [];
  let invalid = 0;
  let duplicate = 0;
  let importedAmount = 0;
  for (const row of eligible) {
    const sourceId = legacyId(row, "INVNO");
    const customerCode = legacyId(row, "CCODE");
    const day = date(value(row, "INVDATE"));
    if (sourceId == null || customerCode == null || !day) {
      invalid++;
      continue;
    }
    if (summary.duplicatePurchases.has(sourceId)) {
      duplicate++;
      continue;
    }
    const lines = linesByInvoice.get(sourceId) ?? [];
    const validLines = lines.filter((line) => number(line, "QTY") > 0 && legacyId(line, "PCODE") != null);
    const subtotal = roundMoney(validLines.reduce((total, line) => total + legacyReturnLineAmount(line), 0));
    const headerDiscount = roundMoney(subtotal * Math.max(0, number(row, "DISC_PCENT")) / 100);
    const amount = roundMoney(Math.max(0, subtotal - headerDiscount));
    if (!validLines.length || amount <= 0) {
      invalid++;
      continue;
    }
    const itemDetails = validLines.map((line) => {
      const productCode = legacyId(line, "PCODE")!;
      const name = productByCode.get(productCode)?.name_en ?? `Oracle product ${productCode}`;
      return `${number(line, "QTY")} x ${name} @ ${roundMoney(number(line, "UPRICE"))}`;
    }).join("; ");
    const remarks = text(value(row, "REMARKS"));
    ledgerRows.push({
      id: uuid("customer-ledger-return-invp-return2", String(sourceId)),
      customer_id: customerIds.get(customerCode)!,
      type: "return",
      amount: -amount,
      entry_date: day,
      ts: timestamp(day),
      note: [
        `Imported from Oracle INV0P RETURN2 invoice ${sourceId}`,
        `Items: ${itemDetails}`,
        remarks,
      ].filter(Boolean).join(" | "),
    });
    importedAmount += amount;
  }

  for (const batch of chunks(ledgerRows, 250)) {
    await retryNetworkWrite("customer_ledger", () => client.from("customer_ledger").upsert(batch, { onConflict: "id" }));
  }
  console.log([
    `INV0P RETURN2 rows flagged: ${flagged.length}`,
    `INV0P RETURN2 rows matching imported customer records: ${eligible.length}`,
    `Imported customer credits from INV0P RETURN2: ${ledgerRows.length}`,
    `INV0P RETURN2 customer credits skipped (invalid date, lines, or amount): ${invalid}`,
    `INV0P RETURN2 customer credits skipped (duplicate invoice number): ${duplicate}`,
    `Total customer credit from INV0P RETURN2: ${roundMoney(importedAmount)}`,
  ].join("\n"));
}

async function importOracleCustomerDiscounts(
  client: Supabase,
  rows: Row[],
  customerIds: Map<number, string>,
  sourceCustomers: Map<number, Row>
) {
  const rowsByVoucher = new Map<number, number>();
  for (const row of rows) {
    const id = legacyId(row, "CASHNO");
    if (id != null) rowsByVoucher.set(id, (rowsByVoucher.get(id) ?? 0) + 1);
  }
  const ledgerRows: Record<string, unknown>[] = [];
  let invalid = 0;
  let duplicate = 0;
  let totalCredit = 0;
  for (const row of rows) {
    const sourceId = legacyId(row, "CASHNO");
    const customerCode = legacyId(row, "CCODE");
    const customerId = customerCode == null ? undefined : customerIds.get(customerCode);
    const day = date(value(row, "CASHDATED"));
    const amount = roundMoney(number(row, "AMT"));
    if (sourceId == null || customerCode == null || !customerId || !sourceCustomers.has(customerCode) || !day || amount <= 0) {
      invalid++;
      continue;
    }
    if (rowsByVoucher.get(sourceId) !== 1) {
      duplicate++;
      continue;
    }
    const remarks = text(value(row, "REMARKS"));
    ledgerRows.push({
      id: uuid("customer-ledger-sale-discount", String(sourceId)),
      customer_id: customerId,
      type: "return",
      amount: -amount,
      entry_date: day,
      ts: timestamp(day),
      note: [`Imported Oracle CASHD1 Sale Discount voucher ${sourceId}`, remarks].filter(Boolean).join(" | "),
    });
    totalCredit += amount;
  }
  for (const batch of chunks(ledgerRows, 250)) {
    await retryNetworkWrite("customer_ledger", () => client.from("customer_ledger").upsert(batch, { onConflict: "id" }));
  }
  console.log([
    `Oracle CASHD1 Sale Discount vouchers: ${ledgerRows.length}`,
    `Sale Discount vouchers skipped (invalid customer, date, or amount): ${invalid}`,
    `Sale Discount vouchers skipped (duplicate voucher number): ${duplicate}`,
    `Total Sale Discount customer credit: ${roundMoney(totalCredit)}`,
  ].join("\n"));
}

async function importOracleCustomerPhones(
  client: Supabase,
  sourceCustomers: Row[],
  sourcePhoneRows: Row[],
  customerRows: { id: string; ora_ccode: number | null; phone: string | null; phone2: string | null; phone_search: string | null }[],
  existingPhoneRows: { id: string; customer_id: string; phone: string; position: number }[]
) {
  const phoneKey = (phone: string) => phone.replace(/\D/g, "") || phone;
  const sourceCustomerByCode = new Map<number, Row>();
  for (const row of sourceCustomers) {
    const code = legacyId(row, "CCODE");
    const name = text(value(row, "CNAME"));
    if (code != null && name && String(row.CODE ?? "").toUpperCase() === "C" &&
      String(row.GODOWN ?? "").toUpperCase() !== "Y") {
      sourceCustomerByCode.set(code, row);
    }
  }
  const customersByCode = new Map(customerRows.flatMap((row) =>
    row.ora_ccode == null ? [] : [[row.ora_ccode, row] as const]
  ));
  const phoneCandidates = new Map<number, { phone: string; key: string }[]>();
  const addPhone = (code: number, phoneValue: Val, sourceKey: string) => {
    const phone = text(phoneValue);
    if (!phone) return;
    const candidates = phoneCandidates.get(code) ?? [];
    if (candidates.some((candidate) => phoneKey(candidate.phone) === phoneKey(phone))) return;
    candidates.push({ phone, key: sourceKey });
    phoneCandidates.set(code, candidates);
  };
  for (const [code, row] of sourceCustomerByCode) {
    addPhone(code, value(row, "CONTACT"), `${code}:CONTACT`);
    addPhone(code, value(row, "PHONENO"), `${code}:PHONENO`);
  }
  for (const row of [...sourcePhoneRows].sort((a, b) => (legacyId(a, "SNO") ?? 0) - (legacyId(b, "SNO") ?? 0))) {
    const code = legacyId(row, "CCODE");
    if (code == null || !sourceCustomerByCode.has(code)) continue;
    const sno = legacyId(row, "SNO");
    addPhone(code, value(row, "MOBILE"), `${code}:CUST2:${sno ?? text(value(row, "MOBILE"))}`);
  }

  const existingByCustomer = new Map<string, { phone: string; position: number }[]>();
  const existingPhoneSets = new Map<string, Set<string>>();
  for (const row of existingPhoneRows) {
    const phones = existingByCustomer.get(row.customer_id) ?? [];
    phones.push({ phone: row.phone, position: Number(row.position) || 0 });
    existingByCustomer.set(row.customer_id, phones);
    const values = existingPhoneSets.get(row.customer_id) ?? new Set<string>();
    values.add(phoneKey(row.phone));
    existingPhoneSets.set(row.customer_id, values);
  }

  const phoneInserts: Record<string, unknown>[] = [];
  const customerUpdates: { id: string; phone: string | null; phone2: string | null; phone_search: string | null }[] = [];
  let duplicate = 0;
  for (const [code, candidates] of phoneCandidates) {
    const customer = customersByCode.get(code);
    if (!customer) continue;
    const existing = (existingByCustomer.get(customer.id) ?? []).sort((a, b) => a.position - b.position);
    const known = existingPhoneSets.get(customer.id) ?? new Set<string>();
    const allPhones: string[] = [];
    const addUnique = (phone: string) => {
      if (!phone || allPhones.some((existingPhone) => phoneKey(existingPhone) === phoneKey(phone))) return;
      allPhones.push(phone);
    };
    for (const phone of existing) addUnique(phone.phone);
    addUnique(text(customer.phone) ?? "");
    addUnique(text(customer.phone2) ?? "");
    let position = existing.reduce((max, phone) => Math.max(max, phone.position), -1) + 1;
    for (const candidate of candidates) {
      const candidateKey = phoneKey(candidate.phone);
      if (known.has(candidateKey)) {
        addUnique(candidate.phone);
        duplicate++;
        continue;
      }
      phoneInserts.push({
        id: uuid("customer-phone-oracle", candidate.key),
        customer_id: customer.id,
        phone: candidate.phone,
        position: position++,
      });
      known.add(candidateKey);
      addUnique(candidate.phone);
    }
    const phone = allPhones[0] ?? null;
    const phone2 = allPhones[1] ?? null;
    const phoneSearch = allPhones.length ? allPhones.join(" ") : null;
    if (phone !== customer.phone || phone2 !== customer.phone2 || phoneSearch !== customer.phone_search) {
      customerUpdates.push({ id: customer.id, phone, phone2, phone_search: phoneSearch });
    }
  }

  for (const batch of chunks(phoneInserts, 250)) {
    await retryNetworkWrite("customer_phones", () => client.from("customer_phones").upsert(batch, { onConflict: "id" }));
  }
  for (const batch of chunks(customerUpdates, 25)) {
    await Promise.all(batch.map((row) =>
      retryNetworkWrite(`customers phone update ${row.id}`, () => client.from("customers")
        .update({ phone: row.phone, phone2: row.phone2, phone_search: row.phone_search })
        .eq("id", row.id))
    ));
  }
  console.log([
    `CUST2 phone rows: ${sourcePhoneRows.length}`,
    `Customers with legacy primary or CUST2 phone numbers: ${phoneCandidates.size}`,
    `Imported customer phone rows: ${phoneInserts.length}`,
    `Existing customer phones left unchanged: ${duplicate}`,
    `Customer phone indexes updated: ${customerUpdates.length}`,
  ].join("\n"));
}

async function importOracleRoutes(
  client: Supabase,
  sourceCustomers: Row[],
  sourceRoutes: Row[],
  customerRows: { id: string; ora_ccode: number | null; route_id: string | null }[],
  existingRoutes: { id: string; name: string; ora_routeid: number | null; list_id: string | null; salesman_id: string | null }[],
  priceLists: { id: string; ora_catid: number | null }[],
  users: { id: string; ora_collectorid: number | null }[]
) {
  const validRoutes = sourceRoutes.flatMap((row) => {
    const id = legacyId(row, "ROUTEID");
    const name = text(value(row, "ROUTENAME"));
    return id == null || !name ? [] : [{ row, id, name }];
  });
  const countsById = new Map<number, number>();
  const countsByName = new Map<string, number>();
  for (const route of validRoutes) {
    countsById.set(route.id, (countsById.get(route.id) ?? 0) + 1);
    const normalized = route.name.toLocaleLowerCase();
    countsByName.set(normalized, (countsByName.get(normalized) ?? 0) + 1);
  }
  const duplicateIds = [...countsById].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicateIds.length) throw new Error(`ROUTE contains duplicate ROUTEID values: ${duplicateIds.join(", ")}`);

  const routesById = new Map(existingRoutes.flatMap((route) =>
    route.ora_routeid == null ? [] : [[route.ora_routeid, route] as const]
  ));
  const existingNameOwners = new Map(existingRoutes.map((route) => [
    route.name.trim().toLocaleLowerCase(),
    route.ora_routeid,
  ]));
  const listIds = new Map(priceLists.flatMap((list) =>
    list.ora_catid == null ? [] : [[list.ora_catid, list.id] as const]
  ));
  const userIds = new Map(users.flatMap((user) =>
    user.ora_collectorid == null ? [] : [[user.ora_collectorid, user.id] as const]
  ));
  let duplicateNames = 0;
  let missingLists = 0;
  let unmatchedCollectors = 0;
  const routeRows = validRoutes.map(({ row, id, name }) => {
    const normalizedName = name.trim().toLocaleLowerCase();
    const existingOwner = existingNameOwners.get(normalizedName);
    const hasNameCollision = (countsByName.get(name.toLocaleLowerCase()) ?? 0) > 1 ||
      (existingNameOwners.has(normalizedName) && existingOwner !== id);
    const existing = routesById.get(id);
    const sourceListId = legacyId(row, "CATID");
    const sourceCollectorId = legacyId(row, "COLLECTORID");
    const matchingUser = sourceCollectorId == null ? undefined : userIds.get(sourceCollectorId);
    if (hasNameCollision) duplicateNames++;
    if (sourceListId != null && !listIds.has(sourceListId)) missingLists++;
    if (sourceCollectorId != null && !matchingUser) unmatchedCollectors++;
    return {
      name: hasNameCollision ? `${name} [${id}]` : name,
      code: String(id),
      ora_routeid: id,
      list_id: (sourceListId == null ? undefined : listIds.get(sourceListId)) ?? existing?.list_id ?? null,
      salesman_id: matchingUser ?? existing?.salesman_id ?? null,
    };
  });
  for (const batch of chunks(routeRows, 100)) {
    await retryNetworkWrite("routes", () => client.from("routes").upsert(batch, { onConflict: "ora_routeid" }));
  }

  const importedRouteIds = new Map<number, string>();
  for (const ids of chunks(validRoutes.map((route) => route.id), 500)) {
    const { data, error } = await client.from("routes").select("id,ora_routeid").in("ora_routeid", ids);
    check("routes", error);
    for (const route of data ?? []) importedRouteIds.set(route.ora_routeid, route.id);
  }
  if (importedRouteIds.size !== validRoutes.length) {
    throw new Error(`Expected ${validRoutes.length} Oracle routes after upsert, found ${importedRouteIds.size}.`);
  }
  const managedRouteIds = new Set(importedRouteIds.values());
  const customersByCode = new Map(customerRows.flatMap((customer) =>
    customer.ora_ccode == null ? [] : [[customer.ora_ccode, customer] as const]
  ));
  const customersByTargetRoute = new Map<string, string[]>();
  let sourceCustomersWithRoute = 0;
  let customersMissingInApp = 0;
  let customersWithUnmappedRoute = 0;
  let assignmentsAlreadyCurrent = 0;
  let assignmentsPreserved = 0;
  for (const source of sourceCustomers) {
    if (String(source.CODE ?? "").toUpperCase() !== "C" ||
      String(source.GODOWN ?? "").toUpperCase() === "Y" || !text(value(source, "CNAME"))) continue;
    const code = legacyId(source, "CCODE");
    const routeCode = legacyId(source, "ROUTE");
    if (code == null || routeCode == null) continue;
    sourceCustomersWithRoute++;
    const routeId = importedRouteIds.get(routeCode);
    if (!routeId) {
      customersWithUnmappedRoute++;
      continue;
    }
    const customer = customersByCode.get(code);
    if (!customer) {
      customersMissingInApp++;
      continue;
    }
    if (customer.route_id === routeId) {
      assignmentsAlreadyCurrent++;
      continue;
    }
    if (customer.route_id != null && !managedRouteIds.has(customer.route_id)) {
      assignmentsPreserved++;
      continue;
    }
    const ids = customersByTargetRoute.get(routeId) ?? [];
    ids.push(customer.id);
    customersByTargetRoute.set(routeId, ids);
  }

  let assignmentsUpdated = 0;
  for (const [routeId, ids] of customersByTargetRoute) {
    for (const batch of chunks(ids, 500)) {
      await retryNetworkWrite(`customer route assignments ${routeId}`, () =>
        client.from("customers").update({ route_id: routeId }).in("id", batch)
      );
      assignmentsUpdated += batch.length;
    }
  }
  console.log([
    `Oracle routes imported: ${routeRows.length}`,
    `Route names disambiguated with legacy IDs: ${duplicateNames}`,
    `Route CATID values without an imported price list: ${missingLists}`,
    `Route collectors without a matching app user: ${unmatchedCollectors}`,
    `Customer source route assignments: ${sourceCustomersWithRoute}`,
    `Customer route assignments updated: ${assignmentsUpdated}`,
    `Customer route assignments already current: ${assignmentsAlreadyCurrent}`,
    `Existing non-Oracle customer route assignments preserved: ${assignmentsPreserved}`,
    `Source customers missing from app: ${customersMissingInApp}`,
    `Customer references to missing source routes: ${customersWithUnmappedRoute}`,
  ].join("\n"));
}

async function importOracleAreas(
  client: Supabase,
  sourceCustomers: Row[],
  sourceCities: Row[],
  customerRows: { id: string; ora_ccode: number | null; area_id: string | null }[],
  existingCities: { id: string; name: string; ora_cityno: number | null }[],
  existingAreas: { id: string; city_id: string; name: string }[]
) {
  const validCities = sourceCities.flatMap((row) => {
    const id = legacyId(row, "CITYNO");
    const name = text(value(row, "CITYNAME")) ?? `Unnamed area [${id ?? "unknown"}]`;
    return id == null ? [] : [{ id, name }];
  });
  const cityCounts = new Map<number, number>();
  const cityNameCounts = new Map<string, number>();
  for (const city of validCities) {
    cityCounts.set(city.id, (cityCounts.get(city.id) ?? 0) + 1);
    const name = city.name.trim().toLocaleLowerCase();
    cityNameCounts.set(name, (cityNameCounts.get(name) ?? 0) + 1);
  }
  const duplicateIds = [...cityCounts].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicateIds.length) throw new Error(`CITY contains duplicate CITYNO values: ${duplicateIds.join(", ")}`);
  if (!validCities.length) throw new Error("No valid CITY rows were found; no areas were imported.");

  const noCityName = "No city";
  const matchingCity = existingCities.find((city) => city.name.trim().toLocaleLowerCase() === noCityName.toLocaleLowerCase());
  if (matchingCity?.ora_cityno != null) {
    throw new Error(`A city named "${noCityName}" is already linked to Oracle CITYNO ${matchingCity.ora_cityno}; resolve this collision before importing areas.`);
  }
  const noCityId = matchingCity?.id ?? uuid("oracle-city", "no-city");
  if (!matchingCity) {
    await retryNetworkWrite("cities No city", () => client.from("cities").upsert({
      id: noCityId,
      name: noCityName,
      ora_cityno: null,
    }, { onConflict: "id" }));
  }

  const areaIdsByOracleCity = new Map(validCities.map((city) => [
    city.id,
    uuid("oracle-area", `CITYNO:${city.id}`),
  ]));
  const managedAreaIds = new Set(areaIdsByOracleCity.values());
  const usedNames = new Set(existingAreas
    .filter((area) => area.city_id === noCityId && !managedAreaIds.has(area.id))
    .map((area) => area.name.trim().toLocaleLowerCase()));
  const areaRows = validCities.map((city) => {
    const duplicateSourceName = (cityNameCounts.get(city.name.trim().toLocaleLowerCase()) ?? 0) > 1;
    let name = duplicateSourceName ? `${city.name} [${city.id}]` : city.name;
    const normalized = name.trim().toLocaleLowerCase();
    if (usedNames.has(normalized)) {
      name = `${city.name} [${city.id}]`;
    }
    let uniqueName = name;
    let suffix = 2;
    while (usedNames.has(uniqueName.trim().toLocaleLowerCase())) {
      uniqueName = `${name} (${suffix++})`;
    }
    usedNames.add(uniqueName.trim().toLocaleLowerCase());
    return {
      id: areaIdsByOracleCity.get(city.id)!,
      city_id: noCityId,
      name: uniqueName,
    };
  });
  for (const batch of chunks(areaRows, 250)) {
    await retryNetworkWrite("areas", () => client.from("areas").upsert(batch, { onConflict: "id" }));
  }

  const customersByCode = new Map(customerRows.flatMap((customer) =>
    customer.ora_ccode == null ? [] : [[customer.ora_ccode, customer] as const]
  ));
  const targetCustomerIdsByArea = new Map<string, string[]>();
  let sourceCustomersWithCity = 0;
  let customersMissingInApp = 0;
  let customersWithUnmappedCity = 0;
  let assignmentsAlreadyCurrent = 0;
  let assignmentsPreserved = 0;
  for (const source of sourceCustomers) {
    if (String(source.CODE ?? "").toUpperCase() !== "C" ||
      String(source.GODOWN ?? "").toUpperCase() === "Y" || !text(value(source, "CNAME"))) continue;
    const customerCode = legacyId(source, "CCODE");
    const cityCode = legacyId(source, "CITYNO");
    if (customerCode == null || cityCode == null) continue;
    sourceCustomersWithCity++;
    const areaId = areaIdsByOracleCity.get(cityCode);
    if (!areaId) {
      customersWithUnmappedCity++;
      continue;
    }
    const customer = customersByCode.get(customerCode);
    if (!customer) {
      customersMissingInApp++;
      continue;
    }
    if (customer.area_id === areaId) {
      assignmentsAlreadyCurrent++;
      continue;
    }
    if (customer.area_id != null && !managedAreaIds.has(customer.area_id)) {
      assignmentsPreserved++;
      continue;
    }
    const ids = targetCustomerIdsByArea.get(areaId) ?? [];
    ids.push(customer.id);
    targetCustomerIdsByArea.set(areaId, ids);
  }
  let assignmentsUpdated = 0;
  for (const [areaId, ids] of targetCustomerIdsByArea) {
    for (const batch of chunks(ids, 500)) {
      await retryNetworkWrite(`customer area assignments ${areaId}`, () =>
        client.from("customers").update({ area_id: areaId }).in("id", batch)
      );
      assignmentsUpdated += batch.length;
    }
  }
  const duplicateNameRows = [...cityNameCounts.values()].filter((count) => count > 1)
    .reduce((total, count) => total + count, 0);
  console.log([
    `No-city parent created or reused: ${noCityName}`,
    `Oracle CITY rows imported as areas: ${areaRows.length}`,
    `Area names disambiguated: ${areaRows.filter((area) => /\[\d+\]/.test(area.name)).length} (duplicate source-name rows: ${duplicateNameRows})`,
    `CITY rows without a valid CITYNO skipped: ${sourceCities.length - validCities.length}`,
    `Imported areas with a source name missing: ${sourceCities.filter((city) => legacyId(city, "CITYNO") != null && !text(value(city, "CITYNAME"))).length}`,
    `Customer source city assignments: ${sourceCustomersWithCity}`,
    `Customer area assignments updated: ${assignmentsUpdated}`,
    `Customer area assignments already current: ${assignmentsAlreadyCurrent}`,
    `Existing non-Oracle customer area assignments preserved: ${assignmentsPreserved}`,
    `Source customers missing from app: ${customersMissingInApp}`,
    `Customer references to missing source cities: ${customersWithUnmappedCity}`,
  ].join("\n"));
}

async function importOracleSupplierPayments(
  client: Supabase,
  sourceCustomers: Row[],
  sourcePurchases: Row[],
  sourcePayments: Row[],
  existingSuppliers: { id: string; code: string; ora_ccode: number | null; name: string }[]
) {
  const sourceAccountsByCode = new Map<number, Row>();
  const godownCodes = new Set<number>();
  for (const row of sourceCustomers) {
    const code = legacyId(row, "CCODE");
    if (code == null) continue;
    if (String(row.GODOWN ?? "").toUpperCase() === "Y") {
      godownCodes.add(code);
      continue;
    }
    if (text(value(row, "CNAME"))) sourceAccountsByCode.set(code, row);
  }
  const referencedCodes = new Set([...sourcePurchases, ...sourcePayments].flatMap((row) => {
    const code = legacyId(row, "CCODE");
    return code == null ? [] : [code];
  }));
  const supplierByCode = new Map(existingSuppliers.flatMap((supplier) =>
    supplier.ora_ccode == null ? [] : [[supplier.ora_ccode, supplier.id] as const]
  ));
  const suppliersByName = new Map<string, { id: string; ora_ccode: number | null }[]>();
  for (const supplier of existingSuppliers) {
    const normalized = supplier.name.trim().toLocaleLowerCase();
    const matches = suppliersByName.get(normalized) ?? [];
    matches.push({ id: supplier.id, ora_ccode: supplier.ora_ccode });
    suppliersByName.set(normalized, matches);
  }
  const namesInUse = new Set(suppliersByName.keys());
  const codesInUse = new Set(existingSuppliers.map((supplier) => supplier.code.toLocaleLowerCase()));
  const claimed = new Set<string>();
  const toCreate: Record<string, unknown>[] = [];
  const toAssign: { id: string; ora_ccode: number }[] = [];
  let missingSourceAccounts = 0;
  let godownReferences = 0;

  for (const code of referencedCodes) {
    if (supplierByCode.has(code)) continue;
    if (godownCodes.has(code)) {
      godownReferences++;
      continue;
    }
    const source = sourceAccountsByCode.get(code);
    if (!source) {
      missingSourceAccounts++;
      continue;
    }
    const name = text(value(source, "CNAME"))!;
    const matches = (suppliersByName.get(name.trim().toLocaleLowerCase()) ?? []).filter((match) =>
      !claimed.has(match.id) && (match.ora_ccode == null || match.ora_ccode === code)
    );
    if (matches.length > 1) {
      throw new Error(`Supplier name for Oracle CUST.CCODE ${code} is ambiguous; resolve it in suppliers before importing.`);
    }
    if (matches.length === 1) {
      const match = matches[0];
      claimed.add(match.id);
      supplierByCode.set(code, match.id);
      if (match.ora_ccode == null) toAssign.push({ id: match.id, ora_ccode: code });
      continue;
    }
    let displayName = name;
    if (namesInUse.has(displayName.trim().toLocaleLowerCase())) displayName = `${name} (Oracle ${code})`;
    namesInUse.add(displayName.trim().toLocaleLowerCase());
    const baseCode = `ORA-${code}`;
    let supplierCode = baseCode;
    for (let suffix = 2; codesInUse.has(supplierCode.toLocaleLowerCase()); suffix++) {
      supplierCode = `${baseCode}-${suffix}`;
    }
    codesInUse.add(supplierCode.toLocaleLowerCase());
    const id = uuid("supplier", String(code));
    supplierByCode.set(code, id);
    toCreate.push({
      id,
      code: supplierCode,
      ora_ccode: code,
      name: displayName,
      name_ur: text(value(source, "CNAMEURDU")),
      contact: text(value(source, "PERSON")),
      phone: text(value(source, "CONTACT")),
      phone2: text(value(source, "PHONENO")),
      address: text(value(source, "ADDRESS")),
      ntn: text(value(source, "NTNNO")),
      email: text(value(source, "EMAIL")),
      credit_days: Math.max(0, Math.trunc(number(source, "CDAYS"))),
      status: String(source.ACTIVE ?? "").toUpperCase() === "N" ? "archived" : "active",
    });
  }

  for (const assignment of toAssign) {
    await retryNetworkWrite(`supplier Oracle code ${assignment.ora_ccode}`, () =>
      client.from("suppliers").update({ ora_ccode: assignment.ora_ccode }).eq("id", assignment.id)
    );
  }
  for (const batch of chunks(toCreate, 100)) {
    await retryNetworkWrite("suppliers", () =>
      client.from("suppliers").upsert(batch, { onConflict: "ora_ccode" })
    );
  }

  const importedSupplierIds = new Map<number, string>();
  for (const codes of chunks([...referencedCodes], 500)) {
    const { data, error } = await client.from("suppliers").select("id,ora_ccode").in("ora_ccode", codes);
    check("suppliers", error);
    for (const supplier of data ?? []) importedSupplierIds.set(supplier.ora_ccode, supplier.id);
  }
  const paymentCounts = new Map<number, number>();
  const usablePayments: { row: Row; sourceId: number; supplierId: string; day: string; amount: number }[] = [];
  let invalidPayments = 0;
  let duplicatePayments = 0;
  for (const row of sourcePayments) {
    const sourceId = legacyId(row, "CASHNO");
    const code = legacyId(row, "CCODE");
    const day = date(value(row, "CASHDATED"));
    const amount = roundMoney(number(row, "AMT"));
    const supplierId = code == null ? undefined : importedSupplierIds.get(code);
    if (sourceId == null || code == null || !supplierId || !day || amount <= 0) {
      invalidPayments++;
      continue;
    }
    const count = paymentCounts.get(sourceId) ?? 0;
    if (count > 0) {
      duplicatePayments++;
      continue;
    }
    paymentCounts.set(sourceId, count + 1);
    usablePayments.push({ row, sourceId, supplierId, day, amount });
  }
  const paymentRows = usablePayments.map(({ row, sourceId, supplierId, day, amount }) => {
    const id = uuid("supplier-payment", String(sourceId));
    const method = text(value(row, "CHECKNO"))
      ? "cheque"
      : String(row.ISINST ?? "").toUpperCase() === "Y" || legacyId(row, "BANKCCODE") != null
        ? "bank"
        : "cash";
    return {
      payment: {
        id,
        pay_date: day,
        created_at: timestamp(day),
        supplier_id: supplierId,
        amount,
        method,
        ref_no: text(value(row, "CHECKNO")),
        note: [text(value(row, "REMARKS")), "Imported from Oracle CASHP1"].filter(Boolean).join(" | "),
        idem_key: key("CASHP1", sourceId),
      },
      ledger: {
        id: uuid("supplier-ledger-payment", String(sourceId)),
        supplier_id: supplierId,
        type: "payment",
        amount: -amount,
        ref: id,
        entry_date: day,
        ts: timestamp(day),
        note: "Imported supplier payment from Oracle CASHP1",
      },
    };
  });
  for (const batch of chunks(paymentRows.map((row) => row.payment), 250)) {
    await retryNetworkWrite("supplier_payments", () =>
      client.from("supplier_payments").upsert(batch, { onConflict: "idem_key" })
    );
  }
  for (const batch of chunks(paymentRows.map((row) => row.ledger), 250)) {
    await retryNetworkWrite("supplier_ledger", () =>
      client.from("supplier_ledger").upsert(batch, { onConflict: "id" })
    );
  }
  console.log([
    `Supplier account codes referenced by purchases/payments: ${referencedCodes.size}`,
    `Supplier profiles created or matched to existing records: ${toCreate.length + toAssign.length}`,
    `Supplier source records missing: ${missingSourceAccounts}`,
    `Supplier payment references to godown records: ${godownReferences}`,
    `Supplier payment rows imported or reconciled: ${usablePayments.length}`,
    `Invalid/unmapped supplier payment rows skipped: ${invalidPayments}`,
    `Duplicate CASHP1 voucher rows skipped: ${duplicatePayments}`,
    `CASHP1 payment total: ${roundMoney(usablePayments.reduce((total, row) => total + row.amount, 0))}`,
  ].join("\n"));
}

async function main() {
  console.log(apply ? "Import mode: APPLY" : "Import mode: PREVIEW (no database writes)");
  if (customerPaymentsOnly) console.log("Scope: customer receipts only");
  if (salesReturnsOnly) console.log("Scope: sales returns only");
  if (customerDiscountsOnly) console.log("Scope: customer sale discounts only");
  if (customerPhonesOnly) console.log("Scope: customer phone numbers only");
  if (routesOnly) console.log("Scope: Oracle routes and customer route assignments only");
  if (areasOnly) console.log('Scope: Oracle CITY areas under "No city"');
  if (supplierPaymentsOnly) console.log("Scope: supplier accounts and CASHP1 supplier payments only");
  let sb: Supabase | undefined;
  let customerIds = new Map<number, string>();
  let customerPhoneRows: { id: string; ora_ccode: number | null; phone: string | null; phone2: string | null; phone_search: string | null }[] = [];
  let existingCustomerPhones: { id: string; customer_id: string; phone: string; position: number }[] = [];
  let routeCustomerRows: { id: string; ora_ccode: number | null; route_id: string | null }[] = [];
  let existingRoutes: { id: string; name: string; ora_routeid: number | null; list_id: string | null; salesman_id: string | null }[] = [];
  let routePriceLists: { id: string; ora_catid: number | null }[] = [];
  let routeUsers: { id: string; ora_collectorid: number | null }[] = [];
  let areaCustomerRows: { id: string; ora_ccode: number | null; area_id: string | null }[] = [];
  let existingCities: { id: string; name: string; ora_cityno: number | null }[] = [];
  let existingAreas: { id: string; city_id: string; name: string }[] = [];
  let productByCode = new Map<number, { id: string; name_en: string }>();
  let locationIds = new Map<number, string>();
  let existingSuppliers: { id: string; code: string; ora_ccode: number | null; name: string }[] = [];

  if (apply || supplierPaymentsOnly) {
    const { db } = await import("../lib/supabase");
    sb = db();
    const schemas = supplierPaymentsOnly ? [
      ["suppliers", "id,code,ora_ccode,name"],
      ["supplier_payments", "id,idem_key"],
      ["supplier_ledger", "id,supplier_id,type,amount"],
    ] as const : customerPaymentsOnly ? [
      ["customers", "id,ora_ccode"],
      ["customer_ledger", "id,customer_id,type,amount"],
      ["payments", "id,idem_key"],
    ] as const : customerDiscountsOnly ? [
      ["customers", "id,ora_ccode"],
      ["customer_ledger", "id,customer_id,type,amount"],
    ] as const : customerPhonesOnly ? [
      ["customers", "id,ora_ccode,phone,phone2,phone_search"],
      ["customer_phones", "id,customer_id,phone,position"],
    ] as const : routesOnly ? [
      ["customers", "id,ora_ccode,route_id"],
      ["routes", "id,name,ora_routeid,list_id,salesman_id"],
      ["price_lists", "id,ora_catid"],
      ["app_users", "id,ora_collectorid"],
    ] as const : areasOnly ? [
      ["customers", "id,ora_ccode,area_id"],
      ["cities", "id,name,ora_cityno"],
      ["areas", "id,city_id,name"],
    ] as const : salesReturnsOnly ? [
      ["customers", "id,ora_ccode"],
      ["products", "id,ora_pcode,name_en"],
      ["customer_ledger", "id,customer_id,type,amount"],
      ["sales", "id,idem_key"],
      ["sale_items", "id,sale_id"],
      ["sale_returns", "id,no,sale_id,kind"],
      ["sale_return_lines", "id,return_id,sale_item_id,qty"],
    ] as const : [
      ["customers", "id,ora_ccode"],
      ["products", "id,ora_pcode,name_en"],
      ["locations", "id,ora_ccode"],
      ["customer_ledger", "id,customer_id,type,amount"],
      ["sales", "id,idem_key"],
      ["sale_items", "id,sale_id"],
      ["payments", "id,idem_key"],
      ["suppliers", "id,ora_ccode,name"],
      ["supplier_ledger", "id,supplier_id,type,amount"],
      ["purchases", "id,idem_key"],
      ["purchase_items", "id,purchase_id"],
      ["supplier_payments", "id,idem_key"],
      ["sale_returns", "id,no,sale_id,kind"],
      ["sale_return_lines", "id,return_id,sale_item_id,qty"],
    ] as const;
    if (apply) {
      for (const [table, columns] of schemas) {
        const { error } = await sb.from(table).select(columns).limit(0);
        check(table, error);
      }
    }

    async function fetchAll<T>(table: string, select: string): Promise<T[]> {
      const rows: T[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb!.from(table).select(select).range(from, from + 999);
        check(table, error);
        rows.push(...((data ?? []) as unknown as T[]));
        if (!data || data.length < 1000) break;
      }
      return rows;
    }

    if (supplierPaymentsOnly) {
      existingSuppliers = await fetchAll<{ id: string; code: string; ora_ccode: number | null; name: string }>(
        "suppliers", "id,code,ora_ccode,name"
      );
    }

    const customers = customerPhonesOnly
      ? await fetchAll<{ id: string; ora_ccode: number | null; phone: string | null; phone2: string | null; phone_search: string | null }>(
        "customers", "id,ora_ccode,phone,phone2,phone_search"
      )
      : routesOnly
        ? await fetchAll<{ id: string; ora_ccode: number | null; route_id: string | null }>(
          "customers", "id,ora_ccode,route_id"
        )
      : areasOnly
        ? await fetchAll<{ id: string; ora_ccode: number | null; area_id: string | null }>(
          "customers", "id,ora_ccode,area_id"
        )
      : await fetchAll<{ id: string; ora_ccode: number | null }>("customers", "id,ora_ccode");
    customerIds = new Map(customers.filter((row) => row.ora_ccode != null).map((row) => [row.ora_ccode!, row.id]));
    if (areasOnly) {
      areaCustomerRows = customers as typeof areaCustomerRows;
      [existingCities, existingAreas] = await Promise.all([
        fetchAll<typeof existingCities[number]>("cities", "id,name,ora_cityno"),
        fetchAll<typeof existingAreas[number]>("areas", "id,city_id,name"),
      ]);
    }
    if (routesOnly) {
      routeCustomerRows = customers as typeof routeCustomerRows;
      [existingRoutes, routePriceLists, routeUsers] = await Promise.all([
        fetchAll<typeof existingRoutes[number]>("routes", "id,name,ora_routeid,list_id,salesman_id"),
        fetchAll<typeof routePriceLists[number]>("price_lists", "id,ora_catid"),
        fetchAll<typeof routeUsers[number]>("app_users", "id,ora_collectorid"),
      ]);
    }
    if (customerPhonesOnly) {
      customerPhoneRows = customers as typeof customerPhoneRows;
      existingCustomerPhones = await fetchAll<{ id: string; customer_id: string; phone: string; position: number }>(
        "customer_phones", "id,customer_id,phone,position"
      );
    }
    if (!customerPaymentsOnly && !customerDiscountsOnly && !customerPhonesOnly && !supplierPaymentsOnly &&
      !routesOnly && !areasOnly) {
      const [products, locations, suppliers] = await Promise.all([
        fetchAll<{ id: string; ora_pcode: number | null; name_en: string }>("products", "id,ora_pcode,name_en"),
        fetchAll<{ id: string; ora_ccode: number | null }>("locations", "id,ora_ccode"),
        fetchAll<{ id: string; code: string; ora_ccode: number | null; name: string }>("suppliers", "id,code,ora_ccode,name"),
      ]);
      productByCode = new Map(products.filter((row) => row.ora_pcode != null).map((row) => [row.ora_pcode!, { id: row.id, name_en: row.name_en }]));
      locationIds = new Map(locations.filter((row) => row.ora_ccode != null).map((row) => [row.ora_ccode!, row.id]));
      existingSuppliers = suppliers;
    }
  }

  const selectedTables = supplierPaymentsOnly
    ? ["CUST", "INV0P", "CASHP1"]
    : customerPaymentsOnly
    ? ["CUST", "CASHR1", "CASH_REC0", "CASH_REC1"]
    : customerDiscountsOnly
      ? ["CUST", "CASHD1"]
      : customerPhonesOnly
        ? ["CUST", "CUST2"]
        : routesOnly
          ? ["CUST", "ROUTE"]
          : areasOnly
            ? ["CUST", "CITY"]
      : salesReturnsOnly
        ? ["CUST", "PROD", "INV0S", "INV1S", "INV0P", "INV1P", "INVR0", "INVR1"]
        : TABLES;
  const summary = await readSummary(file!, apply && !customerPaymentsOnly && !customerDiscountsOnly &&
    !customerPhonesOnly && !routesOnly && !areasOnly && !supplierPaymentsOnly ? new Set(productByCode.keys()) : undefined, selectedTables);
  const directReceiptCounts = new Map<string, number>();
  for (const row of summary.receipts) {
    const customerCode = legacyId(row, "CCODE");
    const day = date(value(row, "CASHDATED"));
    const amount = paymentTotal(row, ["AMT"]);
    if (customerCode == null || !day || amount <= 0) continue;
    const receipt = receiptKey(customerCode, day, amount);
    directReceiptCounts.set(receipt, (directReceiptCounts.get(receipt) ?? 0) + 1);
  }
  let duplicateReceiptSheetRows = 0;
  let positiveReceiptSheetRows = 0;
  for (const row of summary.receiptBatchRows) {
    const batch = summary.receiptBatches.get(legacyId(row, "CASHNO") ?? -1);
    const amount = receiptSheetAmount(row);
    if (!batch || amount <= 0) continue;
    positiveReceiptSheetRows++;
    const customerCode = legacyId(row, "CCODE");
    const day = date(value(batch, "CASHDATED"));
    if (customerCode == null || !day) continue;
    const match = receiptKey(customerCode, day, amount);
    const count = directReceiptCounts.get(match) ?? 0;
    if (count > 0) {
      directReceiptCounts.set(match, count - 1);
      duplicateReceiptSheetRows++;
    }
  }
  if (!apply) {
    if (supplierPaymentsOnly) {
      const accountsByCode = new Map(summary.customers.flatMap((row) => {
        const code = legacyId(row, "CCODE");
        const name = text(value(row, "CNAME"));
        return code != null && name && String(row.GODOWN ?? "").toUpperCase() !== "Y"
          ? [[code, row] as const]
          : [];
      }));
      const referencedCodes = new Set([...summary.purchases, ...summary.supplierPayments].flatMap((row) => {
        const code = legacyId(row, "CCODE");
        return code == null ? [] : [code];
      }));
      const eligiblePayments = summary.supplierPayments.filter((row) => {
        const sourceId = legacyId(row, "CASHNO");
        const code = legacyId(row, "CCODE");
        return sourceId != null && code != null && accountsByCode.has(code) &&
          date(value(row, "CASHDATED")) != null && number(row, "AMT") > 0;
      });
      const existingCodes = new Set(existingSuppliers.flatMap((supplier) =>
        supplier.ora_ccode == null ? [] : [supplier.ora_ccode]
      ));
      const existingByName = new Map<string, { id: string; ora_ccode: number | null }[]>();
      for (const supplier of existingSuppliers) {
        const normalized = supplier.name.trim().toLocaleLowerCase();
        const matches = existingByName.get(normalized) ?? [];
        matches.push({ id: supplier.id, ora_ccode: supplier.ora_ccode });
        existingByName.set(normalized, matches);
      }
      let alreadyLinked = 0;
      let nameMatched = 0;
      let requiresCreation = 0;
      let ambiguousMatches = 0;
      for (const code of referencedCodes) {
        if (existingCodes.has(code)) {
          alreadyLinked++;
          continue;
        }
        const account = accountsByCode.get(code);
        if (!account) continue;
        const name = text(value(account, "CNAME"))!.trim().toLocaleLowerCase();
        const matches = (existingByName.get(name) ?? []).filter((supplier) =>
          supplier.ora_ccode == null || supplier.ora_ccode === code
        );
        if (matches.length === 1) nameMatched++;
        else if (matches.length > 1) ambiguousMatches++;
        else requiresCreation++;
      }
      const missingCodes = [...referencedCodes].filter((code) => !accountsByCode.has(code));
      const unmatchedTypes = new Map<string, number>();
      for (const code of missingCodes) {
        const source = summary.customers.find((row) => legacyId(row, "CCODE") === code);
        const type = source ? String(source.CODE ?? "(blank)").toUpperCase() : "(missing)";
        unmatchedTypes.set(type, (unmatchedTypes.get(type) ?? 0) + 1);
      }
      const paymentTotal = roundMoney(eligiblePayments.reduce((total, row) => total + number(row, "AMT"), 0));
      console.log([
        "Oracle supplier-account and payment preview (no database writes)",
        `INV0P purchase headers used to identify supplier accounts: ${summary.purchases.length}`,
        `CASHP1 supplier payment rows: ${summary.supplierPayments.length}`,
        `Payment rows with valid referenced CUST account, date, and amount: ${eligiblePayments.length}`,
        `Unique CUST account codes referenced by payments: ${referencedCodes.size}`,
        `Referenced accounts already linked to an app supplier: ${alreadyLinked}`,
        `Referenced accounts matched by name to an existing app supplier: ${nameMatched}`,
        `Referenced accounts requiring a new app supplier: ${requiresCreation}`,
        `Referenced accounts with ambiguous supplier-name matches: ${ambiguousMatches}`,
        `Referenced accounts missing a usable CUST record: ${missingCodes.length}${unmatchedTypes.size ? ` (${[...unmatchedTypes].map(([type, count]) => `${type}: ${count}`).join(", ")})` : ""}`,
        `CASHP1 amount mapped to valid accounts: ${paymentTotal}`,
        "Supplier identity is determined by purchase/payment references, not CUST.CODE; the same CUST account may also remain a customer.",
        "Run again with supplier-payments-only apply to reconcile suppliers and import these payments.",
      ].join("\n"));
      return;
    }
    if (areasOnly) {
      const citiesByCode = new Set(summary.cities.flatMap((row) => {
        const id = legacyId(row, "CITYNO");
        return id == null ? [] : [id];
      }));
      const eligibleCustomers = summary.customers.filter((row) =>
        String(row.CODE ?? "").toUpperCase() === "C" &&
        String(row.GODOWN ?? "").toUpperCase() !== "Y" && text(value(row, "CNAME"))
      );
      const customersWithCity = eligibleCustomers.filter((row) => legacyId(row, "CITYNO") != null).length;
      const missingCityIds = [...new Set(eligibleCustomers.flatMap((row) => {
        const city = legacyId(row, "CITYNO");
        return city != null && !citiesByCode.has(city) ? [city] : [];
      }))];
      const names = new Map<string, number>();
      for (const row of summary.cities) {
        const name = text(value(row, "CITYNAME"));
        const id = legacyId(row, "CITYNO");
        if (id != null) {
          const normalized = (name ?? `Unnamed area [${id}]`).trim().toLocaleLowerCase();
          names.set(normalized, (names.get(normalized) ?? 0) + 1);
        }
      }
      const duplicateNameRows = [...names.values()].filter((count) => count > 1)
        .reduce((total, count) => total + count, 0);
      console.log([
        'Oracle area import preview (no database writes; parent city will be "No city")',
        `CITY source rows: ${summary.cities.length}`,
        `Valid Oracle areas: ${citiesByCode.size}`,
        `Areas with a missing source name (imported as "Unnamed area [CITYNO]"): ${summary.cities.filter((row) => legacyId(row, "CITYNO") != null && !text(value(row, "CITYNAME"))).length}`,
        `Duplicate-name area rows (will be disambiguated by CITYNO): ${duplicateNameRows}`,
        `Eligible customer rows: ${eligibleCustomers.length}`,
        `Customers with a legacy city/area assignment: ${customersWithCity}`,
        `Customer references to missing source cities: ${missingCityIds.join(", ") || "none"}`,
        "Existing manual customer area assignments will be preserved.",
        "Run again with areas-only apply to import.",
      ].join("\n"));
      return;
    }
    if (routesOnly) {
      const sourceRouteIds = new Set(summary.routes.flatMap((row) => {
        const id = legacyId(row, "ROUTEID");
        const name = text(value(row, "ROUTENAME"));
        return id != null && name ? [id] : [];
      }));
      const sourceCustomers = summary.customers.filter((row) =>
        String(row.CODE ?? "").toUpperCase() === "C" &&
        String(row.GODOWN ?? "").toUpperCase() !== "Y" && text(value(row, "CNAME"))
      );
      const customersWithRoute = sourceCustomers.filter((row) => legacyId(row, "ROUTE") != null).length;
      const missingRouteIds = [...new Set(sourceCustomers.flatMap((row) => {
        const route = legacyId(row, "ROUTE");
        return route != null && !sourceRouteIds.has(route) ? [route] : [];
      }))];
      const nameCounts = new Map<string, number>();
      for (const row of summary.routes) {
        const id = legacyId(row, "ROUTEID");
        const name = text(value(row, "ROUTENAME"));
        if (id == null || !name) continue;
        const normalized = name.toLocaleLowerCase();
        nameCounts.set(normalized, (nameCounts.get(normalized) ?? 0) + 1);
      }
      const duplicateNameRows = [...nameCounts.values()].filter((count) => count > 1)
        .reduce((total, count) => total + count, 0);
      console.log([
        "Oracle route import preview (no database writes)",
        `ROUTE rows: ${summary.routes.length}`,
        `Routes with a valid ID and name: ${sourceRouteIds.size}`,
        `Route rows with duplicate names (will be disambiguated by legacy ID): ${duplicateNameRows}`,
        `Eligible customer rows: ${sourceCustomers.length}`,
        `Customers with a legacy route assignment: ${customersWithRoute}`,
        `Customer references to missing source routes: ${missingRouteIds.join(", ") || "none"}`,
        "Customer area/city assignments are not changed. Route salesperson is linked only when a matching app user exists.",
        "Run again with routes-only apply to import.",
      ].join("\n"));
      return;
    }
    if (customerPhonesOnly) {
      const sourceCustomerCodes = new Set(summary.customers.flatMap((row) => {
        const code = legacyId(row, "CCODE");
        const name = text(value(row, "CNAME"));
        return code != null && name && String(row.CODE ?? "").toUpperCase() === "C" &&
          String(row.GODOWN ?? "").toUpperCase() !== "Y" ? [code] : [];
      }));
      const phonePairs = new Set<string>();
      const phoneCustomers = new Set<number>();
      for (const row of summary.customerPhones) {
        const code = legacyId(row, "CCODE");
        const phone = text(value(row, "MOBILE"));
        if (code == null || !sourceCustomerCodes.has(code) || !phone) continue;
        phonePairs.add(`${code}:${phone}`);
        phoneCustomers.add(code);
      }
      const for786 = summary.customerPhones
        .filter((row) => legacyId(row, "CCODE") === 6200)
        .map((row) => text(value(row, "MOBILE")))
        .filter(Boolean);
      console.log([
        "Oracle customer-phone import preview (no database writes)",
        `CUST2 phone rows: ${summary.customerPhones.length}`,
        `Unique phone numbers mapped to customer records: ${phonePairs.size}`,
        `Customers with CUST2 phone numbers: ${phoneCustomers.size}`,
        `Customer 6200 phone numbers: ${for786.join(", ") || "none"}`,
        "Run again with customer-phones-only apply to import.",
      ].join("\n"));
      return;
    }
    if (customerDiscountsOnly) {
      const sourceCustomerCodes = new Set(summary.customers.flatMap((row) => {
        const code = legacyId(row, "CCODE");
        const name = text(value(row, "CNAME"));
        return code != null && name && String(row.CODE ?? "").toUpperCase() === "C" &&
          String(row.GODOWN ?? "").toUpperCase() !== "Y" ? [code] : [];
      }));
      const valid = summary.customerDiscounts.filter((row) => {
        const customerCode = legacyId(row, "CCODE");
        return customerCode != null && sourceCustomerCodes.has(customerCode) &&
          date(value(row, "CASHDATED")) != null && number(row, "AMT") > 0;
      });
      console.log([
        "Oracle Sale Discount import preview (no database writes)",
        `CASHD1 sale discount vouchers: ${summary.customerDiscounts.length}`,
        `Sale Discount vouchers mapped to customer records: ${valid.length}`,
        `Voucher 5708: ${valid.some((row) => legacyId(row, "CASHNO") === 5708) ? "matched to customer 6200, amount 970.04, dated 2025-12-09" : "not eligible"}`,
        "Run again with customer-discounts-only apply to import.",
      ].join("\n"));
      return;
    }
    if (salesReturnsOnly) {
      const sourceCustomerCodes = new Set(summary.customers.flatMap((row) => {
        const code = legacyId(row, "CCODE");
        const name = text(value(row, "CNAME"));
        return code != null && name && String(row.CODE ?? "").toUpperCase() === "C" &&
          String(row.GODOWN ?? "").toUpperCase() !== "Y" ? [code] : [];
      }));
      const flaggedPurchaseReturns = summary.purchases.filter((row) => String(row.RETURN2 ?? "").toUpperCase() === "Y");
      console.log([
        "Legacy sales-return import preview (no database writes)",
        `Source customers: ${summary.customerPlan.length}`,
        `Return headers (INVR0): ${summary.saleReturns.length}`,
        `Return lines (INVR1): ${summary.counts.INVR1}`,
        `Sales invoices flagged as returned/claimed (INV0S.RETURN2 = Y): ${summary.sales.filter((row) => String(row.RETURN2 ?? "").toUpperCase() === "Y").length}`,
        `Customer records flagged as returns (INV0P.RETURN2 = Y): ${flaggedPurchaseReturns.filter((row) => sourceCustomerCodes.has(legacyId(row, "CCODE") ?? -1)).length}/${flaggedPurchaseReturns.length}`,
        "Run again with sales-returns-only apply to import.",
      ].join("\n"));
      return;
    }
    const sourceCodes = summary.productCodes;
    console.log([
      "Legacy transaction history preview (no database writes)",
      ...(customerPaymentsOnly ? ["Scope: customer receipts only"] : []),
      `Source customers: ${summary.customerPlan.length}`,
      `Sales invoices: ${summary.sales.length} (${summary.saleLines.size} invoice numbers with lines)`,
      `Sales lines: ${summary.counts.INV1S}; headers with no lines: ${summary.sales.filter((row) => {
        const id = legacyId(row, "INVNO");
        return id == null || !summary.saleLines.has(id);
      }).length}`,
      `Purchase invoices: ${summary.purchases.length} (${summary.purchaseLines.size} invoice numbers with lines)`,
      `Purchase lines: ${summary.counts.INV1P}; headers with no lines: ${summary.purchases.filter((row) => {
        const id = legacyId(row, "INVNO");
        return id == null || !summary.purchaseLines.has(id);
      }).length}`,
      `Customer receipts (CASHR1): ${summary.receipts.length}`,
      `Receipt sheet customer entries with amounts (CASH_REC1): ${positiveReceiptSheetRows} (${duplicateReceiptSheetRows} duplicates of CASHR1 will be skipped)`,
      `Sales returns (INVR0): ${summary.saleReturns.length} with ${summary.counts.INVR1} lines`,
      `Sales invoices flagged as returned/claimed (INV0S.RETURN2 = Y): ${summary.sales.filter((row) => String(row.RETURN2 ?? "").toUpperCase() === "Y").length}`,
      `Supplier payments (CASHP1): ${summary.supplierPayments.length}`,
      `Source product codes: ${sourceCodes.size}`,
      "",
      customerPaymentsOnly
        ? "No database writes. Run again with customer-payments-only apply to import customer receipts."
        : "No stock movements will be created. Run again with apply to import.",
    ].join("\n"));
    return;
  }

  const client = sb!;
  if (supplierPaymentsOnly) {
    await importOracleSupplierPayments(
      client,
      summary.customers,
      summary.purchases,
      summary.supplierPayments,
      existingSuppliers
    );
    return;
  }
  const sourceCustomers = new Map(summary.customers.flatMap((row) => {
    const code = legacyId(row, "CCODE");
    const name = text(value(row, "CNAME"));
    if (code == null || !name || String(row.CODE ?? "").toUpperCase() !== "C" || String(row.GODOWN ?? "").toUpperCase() === "Y") return [];
    return [[code, row] as const];
  }));
  const sourceSupplierAccounts = new Map(summary.customers.flatMap((row) => {
    const code = legacyId(row, "CCODE");
    const name = text(value(row, "CNAME"));
    if (code == null || !name || String(row.GODOWN ?? "").toUpperCase() === "Y") return [];
    return [[code, row] as const];
  }));
  const sourceGodownCodes = new Set(summary.customers.flatMap((row) => {
    const code = legacyId(row, "CCODE");
    return code != null && String(row.GODOWN ?? "").toUpperCase() === "Y" ? [code] : [];
  }));
  if (customerDiscountsOnly) {
    await importOracleCustomerDiscounts(client, summary.customerDiscounts, customerIds, sourceCustomers);
    return;
  }
  if (customerPhonesOnly) {
    await importOracleCustomerPhones(
      client,
      summary.customers,
      summary.customerPhones,
      customerPhoneRows,
      existingCustomerPhones
    );
    return;
  }
  if (routesOnly) {
    await importOracleRoutes(
      client,
      summary.customers,
      summary.routes,
      routeCustomerRows,
      existingRoutes,
      routePriceLists,
      routeUsers
    );
    return;
  }
  if (areasOnly) {
    await importOracleAreas(
      client,
      summary.customers,
      summary.cities,
      areaCustomerRows,
      existingCities,
      existingAreas
    );
    return;
  }
  if (customerPaymentsOnly) {
    const receipts = customerReceipts(summary, customerIds, sourceCustomers);
    const payments: Record<string, unknown>[] = [];
    const ledger: Record<string, unknown>[] = [];
    for (const row of receipts.direct) {
      const sourceId = legacyId(row, "CASHNO")!;
      const customerId = customerIds.get(legacyId(row, "CCODE")!)!;
      const day = date(value(row, "CASHDATED"))!;
      const id = uuid("customer-receipt", String(sourceId));
      const amount = roundMoney(number(row, "AMT"));
      payments.push({
        id,
        pay_date: day,
        created_at: timestamp(day),
        customer_id: customerId,
        amount,
        kind: "collection",
        method: String(row.ISINST ?? "").toUpperCase() === "Y" ||
          legacyId(row, "BANKID") != null || text(value(row, "INSTNO")) ? "Bank" : "Cash",
        idem_key: key("CASHR1", sourceId),
      });
      ledger.push({
        id: uuid("customer-ledger-receipt", String(sourceId)),
        customer_id: customerId,
        type: "payment",
        amount: -amount,
        ref: id,
        entry_date: day,
        ts: timestamp(day),
        note: "Imported customer receipt from Oracle CASHR1",
      });
    }
    for (const { row, batchId, lineId, customerId, day, amount } of receipts.sheet) {
      const id = uuid("customer-receipt-sheet", `${batchId}:${lineId}`);
      const method = String(row.ISINST ?? "").toUpperCase() === "Y" ||
        legacyId(row, "BANKID") != null || text(value(row, "INSTNO")) ? "Bank" : "Cash";
      const details = ["AMTREMARKS", "AMT3REMARKS", "AMT4REMARKS", "AMT5REMARKS"]
        .map((field) => text(value(row, field))).filter(Boolean);
      payments.push({
        id,
        pay_date: day,
        created_at: timestamp(day),
        customer_id: customerId,
        amount,
        kind: "collection",
        method,
        idem_key: `oracle:CASH_REC1:${batchId}:${lineId}`,
      });
      ledger.push({
        id: uuid("customer-ledger-receipt-sheet", `${batchId}:${lineId}`),
        customer_id: customerId,
        type: "payment",
        amount: -amount,
        ref: id,
        entry_date: day,
        ts: timestamp(day),
        note: [
          `Imported customer receipt from Oracle CASH_REC1 batch ${batchId}`,
          ...details,
        ].join(" | "),
      });
    }
    for (const batch of chunks(payments, 250)) {
      await retryNetworkWrite("payments", () => sb!.from("payments").upsert(batch, { onConflict: "idem_key" }));
    }
    for (const batch of chunks(ledger, 250)) {
      await retryNetworkWrite("customer_ledger", () => sb!.from("customer_ledger").upsert(batch, { onConflict: "id" }));
    }
    console.log([
      `Imported customer receipts (CASHR1): ${receipts.direct.length}`,
      `Imported customer receipt sheet entries (CASH_REC1): ${receipts.sheet.length}`,
      `Skipped duplicate CASH_REC1 entries already in CASHR1: ${receipts.duplicateSheetRows}`,
      `Skipped invalid or unmapped customer receipt rows: ${receipts.invalid.direct + receipts.invalid.sheet}`,
    ].join("\n"));
    return;
  }
  const purchaseAndPayCodes = new Set<number>();
  for (const row of [...summary.purchases, ...summary.supplierPayments]) {
    const code = legacyId(row, "CCODE");
    if (code != null) purchaseAndPayCodes.add(code);
  }

  const supplierByCode = new Map(existingSuppliers.filter((row) => row.ora_ccode != null).map((row) => [row.ora_ccode!, row.id]));
  const suppliersByName = new Map<string, { id: string; ora_ccode: number | null }[]>();
  for (const row of existingSuppliers) {
    const name = row.name.trim().toLowerCase();
    const matches = suppliersByName.get(name) ?? [];
    matches.push({ id: row.id, ora_ccode: row.ora_ccode });
    suppliersByName.set(name, matches);
  }
  const toCreate: Record<string, unknown>[] = [];
  const toAssign: { id: string; ora_ccode: number }[] = [];
  const namesInUse = new Set(suppliersByName.keys());
  const claimedSupplierIds = new Set<string>();
  const supplierCodesInUse = new Set(existingSuppliers.map((supplier) => supplier.code.toLowerCase()));
  let supplierAccountsMissingFromMaster = 0;
  let supplierGodownAccounts = 0;
  for (const code of purchaseAndPayCodes) {
    if (supplierByCode.has(code)) continue;
    if (sourceGodownCodes.has(code)) {
      supplierGodownAccounts++;
      continue;
    }
    const old = sourceSupplierAccounts.get(code);
    if (!old) {
      supplierAccountsMissingFromMaster++;
      continue;
    }
    const name = text(value(old, "CNAME"))!;
    const sameName = suppliersByName.get(name.toLowerCase()) ?? [];
    const compatible = sameName.filter((entry) =>
      !claimedSupplierIds.has(entry.id) && (entry.ora_ccode == null || entry.ora_ccode === code)
    );
    if (compatible.length > 1) throw new Error(`Supplier name for old CUST.CCODE ${code} is ambiguous; resolve it in suppliers before importing.`);
    if (compatible.length === 1) {
      const match = compatible[0];
      claimedSupplierIds.add(match.id);
      if (match.ora_ccode == null) toAssign.push({ id: match.id, ora_ccode: code });
      supplierByCode.set(code, match.id);
      continue;
    }
    let displayName = name;
    if (namesInUse.has(displayName.toLowerCase())) displayName = `${name} (Oracle ${code})`;
    namesInUse.add(displayName.toLowerCase());
    const id = uuid("supplier", String(code));
    const baseCode = `ORA-${code}`;
    let supplierCode = baseCode;
    for (let suffix = 2; supplierCodesInUse.has(supplierCode.toLowerCase()); suffix++) {
      supplierCode = `${baseCode}-${suffix}`;
    }
    supplierCodesInUse.add(supplierCode.toLowerCase());
    supplierByCode.set(code, id);
    toCreate.push({
      id,
      code: supplierCode,
      ora_ccode: code,
      name: displayName,
      name_ur: text(value(old, "CNAMEURDU")),
      contact: text(value(old, "PERSON")),
      phone: text(value(old, "CONTACT")),
      phone2: text(value(old, "PHONENO")),
      address: text(value(old, "ADDRESS")),
      ntn: text(value(old, "NTNNO")),
      email: text(value(old, "EMAIL")),
      credit_days: Math.max(0, Math.trunc(number(old, "CDAYS"))),
      status: String(old.ACTIVE ?? "").toUpperCase() === "N" ? "archived" : "active",
    });
  }

  const invalid = {
    saleCustomer: 0, saleLines: 0, purchaseSupplier: 0, purchaseLocation: 0, purchaseLines: 0,
    receiptCustomer: 0, receiptSheet: 0, supplierPayment: 0,
  };
  const usableSales = summary.sales.filter((row) => {
    const id = legacyId(row, "INVNO");
    const code = legacyId(row, "CCODE");
    const lines = id == null ? undefined : summary.saleLines.get(id);
    if (id == null || summary.duplicateSales.has(id) || !date(value(row, "INVDATE")) || !lines || lines.count === 0 || lines.invalid > 0) {
      invalid.saleLines++;
      return false;
    }
    if (code == null || !customerIds.has(code) || !sourceCustomers.has(code)) {
      invalid.saleCustomer++;
      return false;
    }
    return true;
  });
  if (salesReturnsOnly) {
    await importOracleReturns(client, summary, usableSales, customerIds, productByCode);
    await importOraclePurchaseReturnCredits(client, summary, customerIds, productByCode);
    return;
  }
  const usablePurchases = summary.purchases.filter((row) => {
    const id = legacyId(row, "INVNO");
    const supplier = legacyId(row, "CCODE");
    const location = legacyId(row, "GCCODE");
    const lines = id == null ? undefined : summary.purchaseLines.get(id);
    if (id == null || summary.duplicatePurchases.has(id) || !date(value(row, "INVDATE")) || !lines || lines.count === 0 || lines.invalid > 0) {
      invalid.purchaseLines++;
      return false;
    }
    if (supplier == null || !supplierByCode.has(supplier)) {
      invalid.purchaseSupplier++;
      return false;
    }
    if (location == null || !locationIds.has(location)) {
      invalid.purchaseLocation++;
      return false;
    }
    return true;
  });
  const usableReceipts = summary.receipts.filter((row) => {
    const code = legacyId(row, "CCODE");
    if (legacyId(row, "CASHNO") == null || code == null || !customerIds.has(code) || !sourceCustomers.has(code) || number(row, "AMT") <= 0 || !date(value(row, "CASHDATED"))) {
      invalid.receiptCustomer++;
      return false;
    }
    return true;
  });
  const remainingDirectReceiptCounts = new Map<string, number>();
  for (const row of usableReceipts) {
    const customerCode = legacyId(row, "CCODE")!;
    const day = date(value(row, "CASHDATED"))!;
    const receipt = receiptKey(customerCode, day, number(row, "AMT"));
    remainingDirectReceiptCounts.set(receipt, (remainingDirectReceiptCounts.get(receipt) ?? 0) + 1);
  }
  const usableReceiptSheetRows = summary.receiptBatchRows.flatMap((row) => {
    const batchId = legacyId(row, "CASHNO");
    const lineId = legacyId(row, "SNO");
    const customerCode = legacyId(row, "CCODE");
    const batch = batchId == null ? undefined : summary.receiptBatches.get(batchId);
    const day = batch ? date(value(batch, "CASHDATED")) : null;
    const amount = receiptSheetAmount(row);
    if (batchId == null || lineId == null || customerCode == null || !day || amount <= 0 || !customerIds.has(customerCode)) {
      invalid.receiptSheet++;
      return [];
    }
    const match = receiptKey(customerCode, day, amount);
    const directCount = remainingDirectReceiptCounts.get(match) ?? 0;
    if (directCount > 0) {
      remainingDirectReceiptCounts.set(match, directCount - 1);
      return [];
    }
    return [{ row, batchId, lineId, customerCode, customerId: customerIds.get(customerCode)!, day, amount }];
  });
  const usableSupplierPayments = summary.supplierPayments.filter((row) => {
    const code = legacyId(row, "CCODE");
    if (legacyId(row, "CASHNO") == null || code == null || !supplierByCode.has(code) || number(row, "AMT") <= 0 || !date(value(row, "CASHDATED"))) {
      invalid.supplierPayment++;
      return false;
    }
    return true;
  });

  console.log([
    `Supplier profiles to create or match: ${toCreate.length + toAssign.length}`,
    `Supplier account codes sourced from mixed CUST master data: ${purchaseAndPayCodes.size}`,
    `Supplier account codes missing a usable CUST record: ${supplierAccountsMissingFromMaster}`,
    `Supplier transaction codes that refer to godowns: ${supplierGodownAccounts}`,
    `Sales invoices to import: ${usableSales.length}/${summary.sales.length}`,
    `Purchase invoices to import: ${usablePurchases.length}/${summary.purchases.length}`,
    `Customer receipts to import: ${usableReceipts.length}/${summary.receipts.length}`,
    `Receipt sheet entries to import: ${usableReceiptSheetRows.length}/${summary.receiptBatchRows.length} (${duplicateReceiptSheetRows} CASHR1 duplicates skipped)`,
    `Supplier payments to import: ${usableSupplierPayments.length}/${summary.supplierPayments.length}`,
  ].join("\n"));

  const openingByCustomer = new Map<string, { id: string; customer_id: string }>();
  const importedCustomerIds = new Set(customerIds.values());
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("customer_ledger").select("id,customer_id").eq("type", "opening").range(from, from + 999);
    check("customer_ledger", error);
    for (const entry of data ?? []) {
      if (!importedCustomerIds.has(entry.customer_id)) continue;
      if (openingByCustomer.has(entry.customer_id)) {
        throw new Error(`Customer ${entry.customer_id} has multiple opening ledger entries; resolve them before importing history.`);
      }
      openingByCustomer.set(entry.customer_id, entry);
    }
    if (!data || data.length < 1000) break;
  }
  const openingRows = summary.customerPlan.flatMap((customer) => {
    const customerId = customerIds.get(customer.ora_ccode);
    const legacy = sourceCustomers.get(customer.ora_ccode);
    if (!customerId || !legacy) return [];
    const existing = openingByCustomer.get(customerId);
    const entryDate = date(value(legacy, "COBAL_DATED"));
    if (!existing && customer.opening_balance === 0) return [];
    return [{
      ...(existing ? { id: existing.id } : { id: uuid("customer-opening", String(customer.ora_ccode)) }),
      customer_id: customerId,
      type: "opening",
      amount: customer.opening_balance,
      ref: customerId,
      ...(entryDate ? { entry_date: entryDate, ts: timestamp(entryDate) } : {}),
      note: "Imported from Oracle CUST.COBAL",
    }];
  });

  for (const assignment of toAssign) {
    check("suppliers", (await client.from("suppliers").update({ ora_ccode: assignment.ora_ccode }).eq("id", assignment.id)).error);
  }
  for (const batch of chunks(toCreate)) {
    check("suppliers", (await client.from("suppliers").upsert(batch, { onConflict: "ora_ccode" })).error);
  }
  for (const batch of chunks(openingRows)) {
    check("customer_ledger", (await client.from("customer_ledger").upsert(batch, { onConflict: "id" })).error);
  }

  const saleRows = usableSales.map((row) => {
    const sourceId = legacyId(row, "INVNO")!;
    const customerCode = legacyId(row, "CCODE")!;
    const customerId = customerIds.get(customerCode)!;
    const line = summary.saleLines.get(sourceId)!;
    const subTotal = Math.max(0, line.gross - line.discount);
    const headerDiscount = roundMoney(subTotal * Math.max(0, roundMoney(number(row, "DISC_PCENT"))) / 100);
    const paid = paymentTotal(row, ["INVCASHD", "INVCASHR", "INVCASHD1", "INVCASHD2", "INVCASHD3"]);
    const day = date(value(row, "INVDATE"))!;
    const id = uuid("sale", String(sourceId));
    const note = [text(value(row, "REMARKS")), "Imported from Oracle INV0S", flagsNote(row)].filter(Boolean).join(" | ");
    return {
      id,
      no: `OLD-${sourceId}`,
      sale_date: day,
      customer_id: customerId,
      customer_name: text(value(sourceCustomers.get(customerCode)!, "CNAME"))!,
      discount: headerDiscount,
      line_discount: roundMoney(line.discount),
      bilti: roundMoney(number(row, "BILTICHG")),
      local_charges: 0,
      total: roundMoney(Math.max(0, subTotal - headerDiscount + roundMoney(number(row, "BILTICHG")))),
      paid,
      remarks: note,
      status: "confirmed",
      sale_kind: "ledger",
      pay_term: paid >= roundMoney(Math.max(0, subTotal - headerDiscount + roundMoney(number(row, "BILTICHG")))) ? "cash" : "credit",
      fulfil_status: "completed",
      idem_key: key("INV0S", sourceId),
      created_at: timestamp(day),
    };
  });
  for (const batch of chunks(saleRows)) {
    check("sales", (await client.from("sales").upsert(batch, { onConflict: "idem_key" })).error);
  }

  const purchaseRows = usablePurchases.map((row) => {
    const sourceId = legacyId(row, "INVNO")!;
    const supplierCode = legacyId(row, "CCODE")!;
    const supplierId = supplierByCode.get(supplierCode)!;
    const locationId = locationIds.get(legacyId(row, "GCCODE")!)!;
    const line = summary.purchaseLines.get(sourceId)!;
    const subTotal = Math.max(0, line.gross - line.discount);
    const headerDiscount = roundMoney(subTotal * Math.max(0, roundMoney(number(row, "DISC_PCENT"))) / 100);
    const paid = paymentTotal(row, ["INVCASHZ", "INVCASHP", "INVCASHZ1"]);
    const day = date(value(row, "INVDATE"))!;
    const id = uuid("purchase", String(sourceId));
    const note = [text(value(row, "REMARKS")), "Imported from Oracle INV0P"].filter(Boolean).join(" | ");
    return {
      id,
      no: `OLD-${sourceId}`,
      purchase_date: day,
      supplier_id: supplierId,
      supplier_name: text(value(sourceCustomers.get(supplierCode)!, "CNAME")) ?? `Oracle supplier ${supplierCode}`,
      supplier_inv_no: text(value(row, "SUPPINVNO")),
      supplier_inv_date: date(value(row, "SUPPINVDATE")),
      location_id: locationId,
      discount: headerDiscount,
      line_discount: roundMoney(line.discount),
      freight: roundMoney(number(row, "BILTIEXP")),
      total: roundMoney(Math.max(0, subTotal - headerDiscount + roundMoney(number(row, "BILTIEXP")))),
      paid,
      remarks: note,
      status: "confirmed",
      idem_key: key("INV0P", sourceId),
      created_at: timestamp(day),
    };
  });
  for (const batch of chunks(purchaseRows)) {
    check("purchases", (await client.from("purchases").upsert(batch, { onConflict: "idem_key" })).error);
  }

  const saleIdByNumber = new Map(saleRows.map((row) => [Number(row.idem_key.slice("oracle:INV0S:".length)), String(row.id)]));
  const purchaseIdByNumber = new Map(purchaseRows.map((row) => [Number(row.idem_key.slice("oracle:INV0P:".length)), String(row.id)]));

  let saleLineSeq = new Map<number, number>();
  let purchaseLineSeq = new Map<number, number>();
  const saleLineBatch: Record<string, unknown>[] = [];
  const purchaseLineBatch: Record<string, unknown>[] = [];
  let saleLinesWritten = 0;
  let purchaseLinesWritten = 0;
  let nextSaleLineProgress = 100_000;
  async function flushLines(batch: Record<string, unknown>[], table: "sale_items" | "purchase_items") {
    const parts = chunks(batch);
    for (let i = 0; i < parts.length; i += 2) {
      await Promise.all(parts.slice(i, i + 2).map((part) =>
        retryNetworkWrite(table, () => client.from(table).upsert(part, { onConflict: "id", ignoreDuplicates: true }))
      ));
    }
    if (table === "sale_items") {
      saleLinesWritten += batch.length;
      if (saleLinesWritten >= nextSaleLineProgress) {
        console.log(`Sale lines synced: ${saleLinesWritten}`);
        nextSaleLineProgress += 100_000;
      }
    } else {
      purchaseLinesWritten += batch.length;
    }
  }
  for await (const { table, row } of streamOracleDump(file!, ["INV1S", "INV1P"])) {
    const sourceId = legacyId(row, "INVNO");
    const pcode = legacyId(row, "PCODE");
    if (sourceId == null || pcode == null) continue;
    const product = productByCode.get(pcode);
    if (!product) continue;
    if (table === "INV1S") {
      const saleId = saleIdByNumber.get(sourceId);
      if (!saleId) continue;
      const lineNo = (saleLineSeq.get(sourceId) ?? 0) + 1;
      saleLineSeq.set(sourceId, lineNo);
      saleLineBatch.push({
        id: uuid("sale-item", `${sourceId}:${lineNo}`),
        sale_id: saleId,
        line_no: lineNo,
        product_id: product.id,
        name: product.name_en,
        qty: number(row, "QTY"),
        free: number(row, "GQTY"),
        price: roundMoney(number(row, "UPRICE")),
        disc_pct: roundMoney(number(row, "DISC_PCENT")),
        line_disc: roundMoney(number(row, "DISC")),
      });
      if (saleLineBatch.length >= 2000) {
        await flushLines(saleLineBatch, "sale_items");
        saleLineBatch.length = 0;
      }
    } else {
      const purchaseId = purchaseIdByNumber.get(sourceId);
      if (!purchaseId) continue;
      const lineNo = (purchaseLineSeq.get(sourceId) ?? 0) + 1;
      purchaseLineSeq.set(sourceId, lineNo);
      purchaseLineBatch.push({
        id: uuid("purchase-item", `${sourceId}:${lineNo}`),
        purchase_id: purchaseId,
        line_no: lineNo,
        product_id: product.id,
        name: product.name_en,
        qty: number(row, "QTY"),
        free: number(row, "GQTY"),
        cost: roundMoney(number(row, "UPRICE")),
        disc_pct: roundMoney(number(row, "DISC_PCENT")),
        line_disc: roundMoney(number(row, "DISC")),
      });
      if (purchaseLineBatch.length >= 2000) {
        await flushLines(purchaseLineBatch, "purchase_items");
        purchaseLineBatch.length = 0;
      }
    }
  }
  if (saleLineBatch.length) await flushLines(saleLineBatch, "sale_items");
  if (purchaseLineBatch.length) await flushLines(purchaseLineBatch, "purchase_items");

  await importOracleReturns(client, summary, usableSales, customerIds, productByCode);
  await importOraclePurchaseReturnCredits(client, summary, customerIds, productByCode);

  const payments: Record<string, unknown>[] = [];
  const customerLedger: Record<string, unknown>[] = [];
  for (const sale of saleRows) {
    const sourceId = Number(sale.idem_key.slice("oracle:INV0S:".length));
    const day = String(sale.sale_date);
    const saleId = String(sale.id);
    customerLedger.push({
      id: uuid("customer-ledger-invoice", String(sourceId)),
      customer_id: sale.customer_id,
      type: "invoice",
      amount: sale.total,
      ref: saleId,
      entry_date: day,
      ts: timestamp(day),
      note: "Imported from Oracle INV0S",
    });
    const paid = Number(sale.paid);
    if (paid > 0) {
      const id = uuid("customer-invoice-payment", String(sourceId));
      payments.push({
        id,
        pay_date: day,
        created_at: timestamp(day),
        customer_id: sale.customer_id,
        amount: paid,
        kind: "invoice",
        sale_id: saleId,
        method: "Imported",
        idem_key: key("INV0S-PAY", sourceId),
      });
      customerLedger.push({
        id: uuid("customer-ledger-invoice-payment", String(sourceId)),
        customer_id: sale.customer_id,
        type: "payment",
        amount: -paid,
        ref: id,
        entry_date: day,
        ts: timestamp(day),
        note: "Imported invoice payment from Oracle INV0S",
      });
    }
  }
  for (const row of usableReceipts) {
    const sourceId = legacyId(row, "CASHNO")!;
    const customerCode = legacyId(row, "CCODE")!;
    const customerId = customerIds.get(customerCode)!;
    const day = date(value(row, "CASHDATED"))!;
    const id = uuid("customer-receipt", String(sourceId));
    const amount = roundMoney(number(row, "AMT"));
    payments.push({
      id,
      pay_date: day,
      created_at: timestamp(day),
      customer_id: customerId,
      amount,
      kind: "collection",
      method: String(row.ISINST ?? "").toUpperCase() === "Y" || legacyId(row, "BANKID") != null || text(value(row, "INSTNO")) ? "Bank" : "Cash",
      idem_key: key("CASHR1", sourceId),
    });
    customerLedger.push({
      id: uuid("customer-ledger-receipt", String(sourceId)),
      customer_id: customerId,
      type: "payment",
      amount: -amount,
      ref: id,
      entry_date: day,
      ts: timestamp(day),
      note: "Imported customer receipt from Oracle CASHR1",
    });
  }
  for (const { row, batchId, lineId, customerId, day, amount } of usableReceiptSheetRows) {
    const id = uuid("customer-receipt-sheet", `${batchId}:${lineId}`);
    const method = String(row.ISINST ?? "").toUpperCase() === "Y" ||
      legacyId(row, "BANKID") != null || text(value(row, "INSTNO")) ? "Bank" : "Cash";
    const details = ["AMTREMARKS", "AMT3REMARKS", "AMT4REMARKS", "AMT5REMARKS"]
      .map((field) => text(value(row, field))).filter(Boolean);
    payments.push({
      id,
      pay_date: day,
      created_at: timestamp(day),
      customer_id: customerId,
      amount,
      kind: "collection",
      method,
      idem_key: `oracle:CASH_REC1:${batchId}:${lineId}`,
    });
    customerLedger.push({
      id: uuid("customer-ledger-receipt-sheet", `${batchId}:${lineId}`),
      customer_id: customerId,
      type: "payment",
      amount: -amount,
      ref: id,
      entry_date: day,
      ts: timestamp(day),
      note: [
        `Imported customer receipt from Oracle CASH_REC1 batch ${batchId}`,
        ...details,
      ].join(" | "),
    });
  }
  for (const batch of chunks(payments)) check("payments", (await client.from("payments").upsert(batch, { onConflict: "idem_key" })).error);
  for (const batch of chunks(customerLedger)) check("customer_ledger", (await client.from("customer_ledger").upsert(batch, { onConflict: "id" })).error);

  const supplierPaymentRows: Record<string, unknown>[] = [];
  const supplierLedger: Record<string, unknown>[] = [];
  for (const purchase of purchaseRows) {
    const sourceId = Number(purchase.idem_key.slice("oracle:INV0P:".length));
    const day = String(purchase.purchase_date);
    const purchaseId = String(purchase.id);
    supplierLedger.push({
      id: uuid("supplier-ledger-purchase", String(sourceId)),
      supplier_id: purchase.supplier_id,
      type: "purchase",
      amount: purchase.total,
      ref: purchaseId,
      entry_date: day,
      ts: timestamp(day),
      note: "Imported from Oracle INV0P",
    });
    const paid = Number(purchase.paid);
    if (paid > 0) {
      const id = uuid("supplier-invoice-payment", String(sourceId));
      supplierPaymentRows.push({
        id,
        pay_date: day,
        created_at: timestamp(day),
        supplier_id: purchase.supplier_id,
        amount: paid,
        method: "cash",
        note: "Imported invoice payment from Oracle INV0P",
        purchase_id: purchaseId,
        idem_key: key("INV0P-PAY", sourceId),
      });
      supplierLedger.push({
        id: uuid("supplier-ledger-invoice-payment", String(sourceId)),
        supplier_id: purchase.supplier_id,
        type: "payment",
        amount: -paid,
        ref: id,
        entry_date: day,
        ts: timestamp(day),
        note: "Imported invoice payment from Oracle INV0P",
      });
    }
  }
  for (const row of usableSupplierPayments) {
    const sourceId = legacyId(row, "CASHNO")!;
    const supplierCode = legacyId(row, "CCODE")!;
    const supplierId = supplierByCode.get(supplierCode)!;
    const day = date(value(row, "CASHDATED"))!;
    const id = uuid("supplier-payment", String(sourceId));
    const method = text(value(row, "CHECKNO"))
      ? "cheque"
      : String(row.ISINST ?? "").toUpperCase() === "Y" || legacyId(row, "BANKCCODE") != null
        ? "bank"
        : "cash";
    const amount = roundMoney(number(row, "AMT"));
    supplierPaymentRows.push({
      id,
      pay_date: day,
      created_at: timestamp(day),
      supplier_id: supplierId,
      amount,
      method,
      ref_no: text(value(row, "CHECKNO")),
      note: [text(value(row, "REMARKS")), "Imported from Oracle CASHP1"].filter(Boolean).join(" | "),
      idem_key: key("CASHP1", sourceId),
    });
    supplierLedger.push({
      id: uuid("supplier-ledger-payment", String(sourceId)),
      supplier_id: supplierId,
      type: "payment",
      amount: -amount,
      ref: id,
      entry_date: day,
      ts: timestamp(day),
      note: "Imported supplier payment from Oracle CASHP1",
    });
  }
  for (const batch of chunks(supplierPaymentRows)) {
    check("supplier_payments", (await client.from("supplier_payments").upsert(batch, { onConflict: "idem_key" })).error);
  }
  for (const batch of chunks(supplierLedger)) check("supplier_ledger", (await client.from("supplier_ledger").upsert(batch, { onConflict: "id" })).error);

  console.log([
    `Imported customer invoices: ${saleRows.length}`,
    `Imported sales lines: ${saleLinesWritten}`,
    `Imported purchases: ${purchaseRows.length}`,
    `Imported purchase lines: ${purchaseLinesWritten}`,
    `Imported customer receipts: ${usableReceipts.length}`,
    `Imported customer receipt sheet entries: ${usableReceiptSheetRows.length}`,
    `Imported supplier payments: ${usableSupplierPayments.length}`,
    `Skipped due to missing customer: ${invalid.saleCustomer + invalid.receiptCustomer + invalid.receiptSheet}`,
    `Skipped due to missing supplier/location: ${invalid.purchaseSupplier + invalid.purchaseLocation + invalid.supplierPayment}`,
    `Skipped due to missing/invalid lines or products: ${invalid.saleLines + invalid.purchaseLines}`,
    "Historical rows were inserted directly; no stock movements were changed.",
  ].join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
