/** "Muslim Auto - BCG Chowk": a customer's name with their area. */
export const withArea = (name: string, area?: string | null) => (area && !name.includes(area) ? name + " - " + area : name);
