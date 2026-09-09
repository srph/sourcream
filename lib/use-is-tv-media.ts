"use client";

import { useEffect, useState } from 'react';

const tvUserAgent = /SMART-TV|Tizen|Web0S|NetCast|HbbTV|TV Safari/i;

export function useIsTvMedia() {
  const [isTv, setIsTv] = useState(false);
  useEffect(() => { setIsTv(tvUserAgent.test(navigator.userAgent)); }, []);
  return isTv;
}
