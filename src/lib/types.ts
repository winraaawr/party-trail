export type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  invite_code: string;
  created_by: string;
};

export type Member = {
  user_id: string;
  role: "leader" | "member";
  display_name: string;
  avatar_url: string | null;
};

export type MemberLocation = {
  user_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: string;
};

export type ItemKind = "activity" | "food" | "transport" | "sight";

export type ItineraryItem = {
  id: string;
  trip_id: string;
  title: string;
  kind: ItemKind;
  starts_at: string;
  place_name: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  created_by: string;
};

export type Stay = {
  id: string;
  trip_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
  created_by: string;
};

export type NewItem = Omit<ItineraryItem, "id" | "trip_id" | "created_by">;
export type NewStay = Omit<Stay, "id" | "trip_id" | "created_by">;

export type Activity = { id: string; text: string; icon: IconName };

export type IconName =
  | "plus"
  | "close"
  | "inn"
  | "flag"
  | "food"
  | "transport"
  | "sight"
  | "pin"
  | "locate"
  | "bell"
  | "bellOff"
  | "mail"
  | "back"
  | "exit"
  | "trash"
  | "person"
  | "check"
  | "copy";

export type TripStore = {
  status: "loading" | "ready" | "error" | "notfound";
  error?: string;
  demo: boolean;
  me: { id: string; name: string };
  trip: Trip | null;
  members: Member[];
  locations: Record<string, MemberLocation>;
  items: ItineraryItem[];
  stays: Stay[];
  activity: Activity[];
  addItem(item: NewItem): Promise<void>;
  removeItem(id: string): Promise<void>;
  addStay(stay: NewStay): Promise<void>;
  removeStay(id: string): Promise<void>;
  publishLocation(pos: { lat: number; lng: number; accuracy: number | null }): Promise<void>;
  clearLocation(): Promise<void>;
  leaveTrip(): Promise<void>;
};
