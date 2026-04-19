export interface FanItem {
  mid: number;
  uname: string;
  sign: string;
  face: string;
}

export interface FanItemWithAttribute extends FanItem {
  attribute: number;
}

export interface WbiKeys {
  imgKey: string;
  subKey: string;
}

export interface NavData {
  mid: number;
  wbi_img: {
    img_url: string;
    sub_url: string;
  };
}

export interface FollowersData {
  total: number;
  list: FanItemWithAttribute[];
}

export interface FansDataWithAttribute {
  total: number;
  list: FanItemWithAttribute[];
  offset?: string;
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
