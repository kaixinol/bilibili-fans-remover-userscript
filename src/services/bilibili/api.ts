import { PAGE_SIZE } from "../../shared/config";
import type {
  ApiResponse,
  FollowersData,
  FollowingsData,
  ModifyFanData,
  WbiKeys
} from "../../shared/types";

import { encWbi } from "./wbi";

export async function getWbiKeys(): Promise<WbiKeys> {
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

  return {
    imgKey: imageUrl.slice(imageUrl.lastIndexOf("/") + 1, imageUrl.lastIndexOf(".")),
    subKey: subUrl.slice(subUrl.lastIndexOf("/") + 1, subUrl.lastIndexOf("."))
  };
}

export async function fetchFansPage(
  mid: string,
  page: number,
  wbiKeys: WbiKeys
): Promise<ApiResponse<FollowersData>> {
  const query = encWbi(
    {
      vmid: mid,
      pn: page,
      ps: PAGE_SIZE,
      order: "desc",
      order_type: "attention"
    },
    wbiKeys.imgKey,
    wbiKeys.subKey
  );

  const response = await fetch(`https://api.bilibili.com/x/relation/followers?${query}`, {
    credentials: "include"
  });

  return (await response.json()) as ApiResponse<FollowersData>;
}

export async function fetchFollowingsPage(
  mid: string,
  page: number,
  wbiKeys: WbiKeys
): Promise<ApiResponse<FollowingsData>> {
  const query = encWbi(
    {
      vmid: mid,
      pn: page,
      ps: PAGE_SIZE,
      order: "desc",
      order_type: "attention"
    },
    wbiKeys.imgKey,
    wbiKeys.subKey
  );

  const response = await fetch(`https://api.bilibili.com/x/relation/followings?${query}`, {
    credentials: "include",
    headers: {
      Referer: "https://space.bilibili.com/"
    }
  });

  return (await response.json()) as ApiResponse<FollowingsData>;
}

export async function loadAllFollowings(
  mid: string,
  wbiKeys: WbiKeys,
  onProgress?: (page: number, totalPages: number) => Promise<void> | void
): Promise<ApiResponse<Set<string>>> {
  const firstPage = await fetchFollowingsPage(mid, 1, wbiKeys);
  if (firstPage.code !== 0) {
    return {
      code: firstPage.code,
      message: firstPage.message,
      data: new Set<string>()
    };
  }

  const followingMidSet = new Set((firstPage.data.list ?? []).map((item) => String(item.mid)));
  const totalPages = Math.max(1, Math.ceil(firstPage.data.total / PAGE_SIZE));

  for (let page = 2; page <= totalPages; page += 1) {
    await onProgress?.(page, totalPages);
    const response = await fetchFollowingsPage(mid, page, wbiKeys);

    if (response.code !== 0) {
      return {
        code: response.code,
        message: response.message,
        data: followingMidSet
      };
    }

    for (const item of response.data.list ?? []) {
      followingMidSet.add(String(item.mid));
    }
  }

  return {
    code: 0,
    message: "0",
    data: followingMidSet
  };
}

export async function kickFan(
  fid: string,
  csrf: string
): Promise<ApiResponse<ModifyFanData>> {
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

  return (await response.json()) as ApiResponse<ModifyFanData>;
}
