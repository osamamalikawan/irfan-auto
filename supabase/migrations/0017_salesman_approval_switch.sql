-- RUN THIS ONLY WHEN THE ANDROID APP IS READY FOR YOUR SALESMEN (after 0016 and after testing approvals).
--
-- Today the Salesman role may create invoices and take payments directly (website and app). That would let a
-- salesman skip the office approval. This takes those two permissions away from the Salesman role, so from now on
-- he can only file requests (orders.request, payments.request, returns.request) and the office approves them.
-- Administrator and any other role you created are not touched.
-- To undo: give the Salesman role "Create sales" and "Receive payments" again under Users & Roles > Roles.
update roles set perms = array_remove(array_remove(perms, 'sales.create'), 'payments.receive') where id = 'salesman';
