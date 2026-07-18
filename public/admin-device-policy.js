export const ADMIN_PHONE_BREAKPOINT = 992;
export const TABLET_MIN_SHORT_EDGE = 600;

const PHONE_USER_AGENT = /(iPhone|iPod|Windows Phone|IEMobile|Opera Mini|BlackBerry|BB10|webOS|Mobile Safari)/i;
const TABLET_USER_AGENT = /(iPad|Tablet|Nexus 7|Nexus 9|Nexus 10|Silk|Kindle|PlayBook)/i;

const finiteDimension = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

export function classifyAdminAccess(input) {
  const viewportWidth = finiteDimension(input.viewportWidth);
  const viewportHeight = finiteDimension(input.viewportHeight, viewportWidth);
  const screenWidth = finiteDimension(input.screenWidth, viewportWidth);
  const screenHeight = finiteDimension(input.screenHeight, viewportHeight);
  const shortestViewportEdge = Math.min(viewportWidth, viewportHeight);
  const shortestScreenEdge = Math.min(screenWidth, screenHeight);
  const userAgent = String(input.userAgent || "");
  const platform = String(input.platform || "");
  const hasTouch = finiteDimension(input.maxTouchPoints) > 0 || Boolean(input.coarsePointer);
  const reportsMobile = Boolean(input.userAgentDataMobile);
  const reportsTablet = TABLET_USER_AGENT.test(userAgent) || (/MacIntel/i.test(platform) && hasTouch);
  const tabletGeometry = hasTouch && shortestViewportEdge >= TABLET_MIN_SHORT_EDGE && shortestScreenEdge >= TABLET_MIN_SHORT_EDGE;
  const isTablet = reportsTablet || tabletGeometry;
  const androidPhone = /Android/i.test(userAgent) && (/Mobile/i.test(userAgent) || shortestScreenEdge < TABLET_MIN_SHORT_EDGE);
  const phoneGeometry = hasTouch && shortestScreenEdge > 0 && shortestScreenEdge < TABLET_MIN_SHORT_EDGE;
  const isPhone = !isTablet && (reportsMobile || PHONE_USER_AGENT.test(userAgent) || androidPhone || phoneGeometry);
  const belowPhoneBreakpoint = viewportWidth < ADMIN_PHONE_BREAKPOINT;
  const blocked = isPhone || (belowPhoneBreakpoint && !isTablet);

  return {
    blocked,
    reason: isPhone ? "phone-device" : blocked ? "narrow-viewport" : "supported",
    formFactor: isPhone ? "phone" : isTablet ? "tablet" : "computer",
    viewportWidth,
    viewportHeight,
  };
}

export function readAdminDeviceSignals(source = window) {
  const navigatorData = source.navigator || {};
  const screenData = source.screen || {};
  const documentElement = source.document?.documentElement;

  return {
    viewportWidth: source.innerWidth || documentElement?.clientWidth || 0,
    viewportHeight: source.innerHeight || documentElement?.clientHeight || 0,
    screenWidth: screenData.width || screenData.availWidth || 0,
    screenHeight: screenData.height || screenData.availHeight || 0,
    userAgent: navigatorData.userAgent || "",
    platform: navigatorData.platform || "",
    userAgentDataMobile: navigatorData.userAgentData?.mobile === true,
    maxTouchPoints: navigatorData.maxTouchPoints || 0,
    coarsePointer: source.matchMedia?.("(pointer: coarse)")?.matches === true,
  };
}

export function getAdminAccessDecision(source = window) {
  return classifyAdminAccess(readAdminDeviceSignals(source));
}
