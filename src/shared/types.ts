export interface FanItem {
  mid: number;
  uname: string;
  sign: string;
  face: string;
}

export interface WbiKeys {
  imgKey: string;
  subKey: string;
}

export interface FollowersData {
  total: number;
  list: FanItem[];
}

export interface FollowingItem {
  mid: number;
  attribute: number;
  uname: string;
  sign: string;
  face: string;
}

export interface FollowingsData {
  total: number;
  list: FollowingItem[];
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface ModifyFanData {
  fid: number;
}

export interface ItemStatus {
  text: string;
  tone: "idle" | "pending" | "success" | "error";
  title?: string;
}
