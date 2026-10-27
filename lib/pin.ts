/** Returns an error message, or null when the PIN is acceptable. */
export function pinError(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return "PIN must be 4 to 8 digits.";
  if (/^(\d)\1+$/.test(pin) || ["1234", "12345", "123456", "4321", "0123", "2580"].includes(pin)) return "Choose a PIN that is harder to guess.";
  return null;
}
