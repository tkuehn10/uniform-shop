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

export type ItemCategory = 'Tops' | 'Bottoms' | 'Hats' | 'Socks';

export type StockMovementReason =
  'delivery' | 'sale' | 'stocktake_adjustment' | 'manual_adjustment';

export type Profile = {
  id: string;
  display_name: string;
  role: UserRole;
  created_at: string;
};

export type Item = {
  id: string;
  name: string;
  category: ItemCategory;
  price: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ItemPhoto = {
  item_id: string;
  image_data: string; // bytea comes back as a hex-encoded string over PostgREST
  content_type: string;
  byte_size: number;
  updated_at: string;
};

export type ItemSize = {
  id: string;
  item_id: string;
  size_label: string;
  sort_order: number;
  quantity_on_hand: number;
  active: boolean;
  created_at: string;
};

export type StockMovement = {
  id: string;
  item_size_id: string;
  quantity_delta: number;
  reason: StockMovementReason;
  reference_table: string | null;
  reference_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  created_at: string;
};

export type Order = {
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
};

export type OrderLine = {
  id: string;
  order_id: string;
  item_size_id: string;
  quantity_ordered: number;
};

export type Delivery = {
  id: string;
  order_id: string;
  delivery_date: string;
  received_by: string | null;
  created_at: string;
};

export type DeliveryLine = {
  id: string;
  delivery_id: string;
  order_line_id: string;
  quantity_received: number;
};

export type Stocktake = {
  id: string;
  stocktake_date: string;
  scope: StocktakeScope;
  created_by: string | null;
  created_at: string;
};

export type StocktakeCount = {
  id: string;
  stocktake_id: string;
  item_size_id: string;
  expected_quantity: number;
  counted_quantity: number;
  calculated_sold: number;
};

export type Sale = {
  id: string;
  sold_at: string;
  created_by: string | null;
  created_at: string;
};

export type SaleLine = {
  id: string;
  sale_id: string;
  item_size_id: string;
  quantity: number;
};

export type OpeningTimeSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
  created_at: string;
};

export type RosterClaim = {
  id: string;
  opening_time_slot_id: string;
  occurrence_date: string;
  claimed_name: string;
  claimed_by: string | null;
  claimed_at: string;
};

export type SchoolHoliday = {
  id: string;
  start_date: string;
  end_date: string;
  label: string | null;
  created_at: string;
};

// Minimal shape so `createClient<Database>()` type-checks; not a full
// generated Database type. See the note at the top of this file.
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      items: { Row: Item; Insert: Partial<Item>; Update: Partial<Item>; Relationships: [] };
      item_photos: {
        Row: ItemPhoto;
        Insert: Partial<ItemPhoto>;
        Update: Partial<ItemPhoto>;
        Relationships: [];
      };
      item_sizes: {
        Row: ItemSize;
        Insert: Partial<ItemSize>;
        Update: Partial<ItemSize>;
        Relationships: [];
      };
      stock_movements: {
        Row: StockMovement;
        Insert: Partial<StockMovement>;
        Update: Partial<StockMovement>;
        Relationships: [];
      };
      suppliers: {
        Row: Supplier;
        Insert: Partial<Supplier>;
        Update: Partial<Supplier>;
        Relationships: [];
      };
      orders: { Row: Order; Insert: Partial<Order>; Update: Partial<Order>; Relationships: [] };
      order_lines: {
        Row: OrderLine;
        Insert: Partial<OrderLine>;
        Update: Partial<OrderLine>;
        Relationships: [];
      };
      deliveries: {
        Row: Delivery;
        Insert: Partial<Delivery>;
        Update: Partial<Delivery>;
        Relationships: [];
      };
      delivery_lines: {
        Row: DeliveryLine;
        Insert: Partial<DeliveryLine>;
        Update: Partial<DeliveryLine>;
        Relationships: [];
      };
      stocktakes: {
        Row: Stocktake;
        Insert: Partial<Stocktake>;
        Update: Partial<Stocktake>;
        Relationships: [];
      };
      stocktake_counts: {
        Row: StocktakeCount;
        Insert: Partial<StocktakeCount>;
        Update: Partial<StocktakeCount>;
        Relationships: [];
      };
      sales: { Row: Sale; Insert: Partial<Sale>; Update: Partial<Sale>; Relationships: [] };
      sale_lines: {
        Row: SaleLine;
        Insert: Partial<SaleLine>;
        Update: Partial<SaleLine>;
        Relationships: [];
      };
      opening_time_slots: {
        Row: OpeningTimeSlot;
        Insert: Partial<OpeningTimeSlot>;
        Update: Partial<OpeningTimeSlot>;
        Relationships: [];
      };
      roster_claims: {
        Row: RosterClaim;
        Insert: Partial<RosterClaim>;
        Update: Partial<RosterClaim>;
        Relationships: [];
      };
      school_holidays: {
        Row: SchoolHoliday;
        Insert: Partial<SchoolHoliday>;
        Update: Partial<SchoolHoliday>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
