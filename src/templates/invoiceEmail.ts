/** Returns the plain-text fallback for the standard BNB invoice email. */
export function createInvoiceEmailText(): string {
  return [
    'Dear Customer :',
    '',
    'Your invoice is attached. Please remit payment at your earliest convenience.',
    '',
    'Thank you for your business - we appreciate it very much.',
    '',
    'Sincerely,',
    '',
    'BNB GLOBAL',
    '(562) 926-7574',
    '',
    'BNB GLOBAL',
    '13415 Marquardt Ave.,',
    'Santa Fe Springs, CA 90670',
    'T) 562-926-7574  F) 562-926-7597',
    'E) info@bnbglobal.biz',
  ].join('\n');
}

/** Builds the BNB invoice email HTML with one fixed signature block. */
export function createInvoiceEmailHtml(): string {
  return `
    <div style="color: #242424; font-family: Verdana, sans-serif; font-size: 11pt; line-height: 1.3; margin: 0; padding: 0;">
      <p style="font-size: 10pt; line-height: 1.6; margin: 0 0 18px;">Dear Customer :</p>
      <p style="font-size: 10pt; line-height: 1.6; margin: 0 0 18px;">Your invoice is attached. &nbsp;Please remit payment at your earliest convenience.</p>
      <p style="font-size: 10pt; line-height: 1.6; margin: 0 0 18px;">Thank you for your business - we appreciate it very much.</p>
      <p style="font-size: 10pt; line-height: 1.6; margin: 0 0 18px;">Sincerely,</p>
      <p style="font-size: 10pt; line-height: 1.6; margin: 0 0 24px;">
        BNB GLOBAL<br>
        <a href="tel:+15629267574" style="color: #1155cc; font-size: 10pt;">(562) 926-7574</a>
      </p>
      <p style="margin: 0;">
        <strong style="font-size: 13.5pt; line-height: 1.2;">BNB GLOBAL</strong><br>
        <a href="https://maps.google.com/?q=13415+Marquardt+Ave+Santa+Fe+Springs+CA+90670" style="color: #1155cc; font-size: 7.5pt;">
          13415 Marquardt Ave.,<br>
          Santa Fe Springs, CA 90670
        </a><br>
        <span style="font-size: 7.5pt;">T)</span> <a href="tel:+15629267574" style="color: #1155cc; font-size: 7.5pt;">562-926-7574</a>
        &nbsp; <span style="font-size: 7.5pt;">F)</span> <a href="tel:+15629267597" style="color: #1155cc; font-size: 7.5pt;">562-926-7597</a><br>
        <span style="font-size: 7.5pt;">E)</span> <a href="mailto:info@bnbglobal.biz" style="color: #1155cc; font-size: 7.5pt;">info@bnbglobal.biz</a><br>
      </p>
      <img src="https://raw.githubusercontent.com/picklebot6/bnb-global/main/bnb_img.png" width="95" alt="GDP Compliant" style="display: block; margin-top: 4px;">
    </div>
  `;
}
