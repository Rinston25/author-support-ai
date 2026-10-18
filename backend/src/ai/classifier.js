// Placeholder: the real classifier (Claude + keyword fallback) is built in the AI step.
// Ticket creation already calls this after the response is sent, so wiring is done.
export async function classifyTicket() {
  // Tickets stay classification_status = 'pending' until the AI step lands.
}
