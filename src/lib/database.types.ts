// Hand-written to match supabase/migrations/20260912000000_initial_schema.sql.
// Once the project is linked (`supabase link`), regenerate the real thing with:
//   supabase gen types typescript --linked > src/lib/database.types.ts
// and this file becomes redundant — keep it until then so the app has types.

export type UserRole = 'admin' | 'user';

export type OrderStatus =
  | 'order_placed'
  | 'partially_received'
  | 'fully_received'
  | 'invoice_checked'
  | 'invoice_sent_to_treasurer'
  | 'closed';

export type StocktakeScope = 'full' | 'spot';

export type StockMovementReason =
  'delivery' | 'sale' | 'stocktake_adjustment' | 'manual_adjustment';

export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  created_at: string;
}

export interface Item {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemPhoto {
  item_id: string;
  image_data: string; // bytea comes back as a hex-encoded string over PostgREST
  content_type: string;
  byte_size: number;
  updated_at: string;
}

export interface ItemSize {
  id: string;
  item_id: string;
  size_label: string;
  sort_order: number;
  quantity_on_hand: number;
  active: boolean;
  created_at: string;
}

export interface StockMovement {
  id: string;
  item_size_id: string;
  quantity_delta: number;
  reason: StockMovementReason;
  reference_table: string | null;
  reference_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  supplier_id: string;
  order_date: string;
  status: OrderStatus;
  invoice_check_note: string | null;
  invoice_sent_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLine {
  id: string;
  order_id: string;
  item_size_id: string;
  quantity_ordered: number;
}

export interface Delivery {
  id: string;
  order_id: string;
  delivery_date: string;
  received_by: string | null;
  created_at: string;
}

export interface DeliveryLine {
  id: string;
  delivery_id: string;
  order_line_id: string;
  quantity_received: number;
}

export interface Stocktake {
  id: string;
  stocktake_date: string;
  scope: StocktakeScope;
  created_by: string | null;
  created_at: string;
}

export interface StocktakeCount {
  id: string;
  stocktake_id: string;
  item_size_id: string;
  expected_quantity: number;
  counted_quantity: number;
  calculated_sold: number;
}

export interface Sale {
  id: string;
  sold_at: string;
  created_by: string | null;
  created_at: string;
}

export interface SaleLine {
  id: string;
  sale_id: string;
  item_size_id: string;
  quantity: number;
}

export interface OpeningTimeSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
  created_at: string;
}

export interface RosterClaim {
  id: string;
  opening_time_slot_id: string;
  occurrence_date: string;
  claimed_name: string;
  claimed_by: string | null;
  claimed_at: string;
}

export interface SchoolHoliday {
  id: string;
  start_date: string;
  end_date: string;
  label: string | null;
  created_at: string;
}

// Minimal shape so `createClient<Database>()` type-checks; not a full
// generated Database type. See the note at the top of this file.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      items: { Row: Item; Insert: Partial<Item>; Update: Partial<Item> };
      item_photos: { Row: ItemPhoto; Insert: Partial<ItemPhoto>; Update: Partial<ItemPhoto> };
      item_sizes: { Row: ItemSize; Insert: Partial<ItemSize>; Update: Partial<ItemSize> };
      stock_movements: {
        Row: StockMovement;
        Insert: Partial<StockMovement>;
        Update: Partial<StockMovement>;
      };
      suppliers: { Row: Supplier; Insert: Partial<Supplier>; Update: Partial<Supplier> };
      orders: { Row: Order; Insert: Partial<Order>; Update: Partial<Order> };
      order_lines: { Row: OrderLine; Insert: Partial<OrderLine>; Update: Partial<OrderLine> };
      deliveries: { Row: Delivery; Insert: Partial<Delivery>; Update: Partial<Delivery> };
      delivery_lines: {
        Row: DeliveryLine;
        Insert: Partial<DeliveryLine>;
        Update: Partial<DeliveryLine>;
      };
      stocktakes: { Row: Stocktake; Insert: Partial<Stocktake>; Update: Partial<Stocktake> };
      stocktake_counts: {
        Row: StocktakeCount;
        Insert: Partial<StocktakeCount>;
        Update: Partial<StocktakeCount>;
      };
      sales: { Row: Sale; Insert: Partial<Sale>; Update: Partial<Sale> };
      sale_lines: { Row: SaleLine; Insert: Partial<SaleLine>; Update: Partial<SaleLine> };
      opening_time_slots: {
        Row: OpeningTimeSlot;
        Insert: Partial<OpeningTimeSlot>;
        Update: Partial<OpeningTimeSlot>;
      };
      roster_claims: {
        Row: RosterClaim;
        Insert: Partial<RosterClaim>;
        Update: Partial<RosterClaim>;
      };
      school_holidays: {
        Row: SchoolHoliday;
        Insert: Partial<SchoolHoliday>;
        Update: Partial<SchoolHoliday>;
      };
    };
  };
}
