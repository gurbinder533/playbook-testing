// Shared copy for the "did visits become signups?" panel on the Meta, UGC and AI chatbot tabs.
// The product's analytics only keep a first-touch click id for Google Ads (gclid), so these channels cannot be counted.
export function notMeasurableHtml(channel, total) {
  return (
    `<p class="attr-head"><b>Not measurable yet.</b> The product doesn’t record where these signups came from, so ${channel} visits cannot be matched to signups.</p>` +
    `<p>Signups from Google Ads can be traced because Google adds a click id to the link, and it survives the hop into the product. ${channel} links add nothing the product keeps: the marketing site’s “Get started” button opens the product with no campaign tag, and no visitor id is shared between the two sites. A count of 0 here would be misleading, so none is shown.</p>` +
    `<p><b>How to fix it:</b> when a visitor arrives with a campaign tag (<code>utm_source</code>, <code>utm_medium</code>, and <code>fbclid</code> where present), have the marketing site add the same tag to the “Get started” link. The product then records it on the signup’s first page, and this panel can count signups exactly from then on. Signups before the change stay unattributed.</p>` +
    (total != null ? `<p class="hint">For scale: ${total.toLocaleString()} external product signups in this date range, from all sources.</p>` : "")
  );
}
