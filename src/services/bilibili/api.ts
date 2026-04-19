import type {
  ApiResponse,
  FansDataWithAttribute,
  FollowersData,
  ModifyFanData,
  NavData,
  WbiKeys
} from "../../shared/types";
import { logInfo } from "../../shared/utils";

import { encWbi } from "./wbi";

export async function getWbiKeys(): Promise<WbiKeys> {
  logInfo("API 调用: 获取 WBI keys", {
    url: "https://api.bilibili.com/x/web-interface/nav"
  });
  const response = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    credentials: "include",
    cache: "no-store"
  });
  const payload = (await response.json()) as {
    data: {
      wbi_img: {
        img_url: string;
        sub_url: string;
      };
    };
  };

  const { img_url: imageUrl, sub_url: subUrl } = payload.data.wbi_img;
  logInfo("API 返回: 获取 WBI keys", {
    imgKey: imageUrl.slice(imageUrl.lastIndexOf("/") + 1, imageUrl.lastIndexOf(".")),
    subKey: subUrl.slice(subUrl.lastIndexOf("/") + 1, subUrl.lastIndexOf("."))
  });

  return {
    imgKey: imageUrl.slice(imageUrl.lastIndexOf("/") + 1, imageUrl.lastIndexOf(".")),
    subKey: subUrl.slice(subUrl.lastIndexOf("/") + 1, subUrl.lastIndexOf("."))
  };
}

export async function getNavData(): Promise<NavData> {
  logInfo("API 调用: 获取登录用户信息", {
    url: "https://api.bilibili.com/x/web-interface/nav"
  });
  const response = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    credentials: "include",
    cache: "no-store"
  });
  const payload = (await response.json()) as {
    data: NavData;
  };

  logInfo("API 返回: 获取登录用户信息", {
    mid: payload.data.mid
  });
  return payload.data;
}

export async function fetchFansPage(
  mid: string,
  page: number,
  wbiKeys: WbiKeys,
  pageSize: number
): Promise<ApiResponse<FollowersData>> {
  const query = encWbi(
    {
      vmid: mid,
      pn: page,
      ps: pageSize,
      order: "desc",
      order_type: "attention"
    },
    wbiKeys.imgKey,
    wbiKeys.subKey
  );

  logInfo("API 调用: 获取粉丝列表（旧接口）", {
    endpoint: "x/relation/followers",
    mid,
    page,
    pageSize
  });
  const response = await fetch(`https://api.bilibili.com/x/relation/followers?${query}`, {
    credentials: "include"
  });

  const payload = (await response.json()) as ApiResponse<FollowersData>;
  logInfo("API 返回: 获取粉丝列表（旧接口）", {
    mid,
    page,
    code: payload.code,
    total: payload.data?.total ?? 0,
    listCount: payload.data?.list?.length ?? 0
  });
  return payload;
}

export async function fetchFansPageWithAttribute(
  mid: string,
  offset: string | null,
  wbiKeys: WbiKeys,
  pageSize: number
): Promise<ApiResponse<FansDataWithAttribute>> {
  const params: Record<string, string | number> = {
    vmid: mid,
    ps: pageSize
  };

  if (offset) {
    params.offset = offset;
  } else {
    params.pn = 1;
  }

  const query = encWbi(params, wbiKeys.imgKey, wbiKeys.subKey);

  logInfo("API 调用: 获取粉丝列表（新接口）", {
    endpoint: "x/relation/fans",
    mid,
    offset: offset || "首次请求",
    pageSize
  });
  const response = await fetch(`https://api.bilibili.com/x/relation/fans?${query}`, {
    credentials: "include",
    headers: {
      Referer: "https://space.bilibili.com/"
    }
  });

  const payload = (await response.json()) as ApiResponse<FansDataWithAttribute>;
  logInfo("API 返回: 获取粉丝列表（新接口）", {
    mid,
    offset: offset || "首次请求",
    code: payload.code,
    total: payload.data?.total ?? 0,
    listCount: payload.data?.list?.length ?? 0,
    nextOffset: payload.data?.offset
  });
  return payload;
}

export async function kickFan(
  fid: string,
  csrf: string
): Promise<ApiResponse<ModifyFanData>> {
  logInfo("API 调用: 移除粉丝", {
    endpoint: "x/relation/modify",
    fid,
    act: 7
  });
  const body = new URLSearchParams({
    fid,
    act: "7",
    re_src: "11",
    csrf
  });

  const response = await fetch("https://api.bilibili.com/x/relation/modify", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    credentials: "include"
  });

  const payload = (await response.json()) as ApiResponse<ModifyFanData>;
  logInfo("API 返回: 移除粉丝", {
    fid,
    code: payload.code,
    message: payload.message
  });
  return payload;
}
