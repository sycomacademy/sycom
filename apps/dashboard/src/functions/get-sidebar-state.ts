import { SIDEBAR_COOKIE_NAME } from "@sycom/ui/components/sidebar";

export const getSidebarState = () => {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`));
  const value = match?.slice(SIDEBAR_COOKIE_NAME.length + 1);
  return value === undefined ? undefined : value === "true";
};
