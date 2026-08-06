/**
 * The mailboxes Foundation-1 actually operates, all on the 1os.foundation-1.co.za
 * subdomain that is verified for sending. Any address shown to a client or used
 * as a sender must come from here: an address without a real mailbox silently
 * loses replies.
 */

/** System sender for transactional mail. Not monitored for replies. */
export const FOUNDATION_NOREPLY = "noreply@1os.foundation-1.co.za";

/** Client support. The reply-to on every client lifecycle message. */
export const FOUNDATION_SUPPORT = "support@1os.foundation-1.co.za";

/** Migration case correspondence. */
export const FOUNDATION_MIGRATIONS = "migrate@1os.foundation-1.co.za";

/** Commercial and partner correspondence. */
export const FOUNDATION_SALES = "sales@1os.foundation-1.co.za";

/** Karman's warmed outreach mailbox, used from the sales dashboard. */
export const FOUNDATION_OUTREACH = "karman@1os.foundation-1.co.za";

/** Client-facing support number. */
export const FOUNDATION_SUPPORT_PHONE = "069 811 7112";

export const FOUNDATION_FROM_DEFAULT = `Foundation-1 <${FOUNDATION_NOREPLY}>`;
