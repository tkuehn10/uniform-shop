import type { OrderStatus } from './database.types';

// The fixed, linear sequence from requirements.md REQ-6. Admin can still
// manually jump to any stage (REQ-13, A8) -- this array is just the "normal
// flow" ordering used for labels and the override picker.
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'order_placed',
  'partially_received',
  'fully_received',
  'invoice_checked',
  'invoice_sent_to_treasurer',
  'closed'
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  order_placed: 'Order Placed',
  partially_received: 'Partially Received',
  fully_received: 'Fully Received',
  invoice_checked: 'Invoice Checked',
  invoice_sent_to_treasurer: 'Invoice Sent to Treasurer',
  closed: 'Closed'
};
