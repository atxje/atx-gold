// Fixed wording printed on every bill of sale. Edit here to change the form.
//
// SELLER_DISCLAIMER prints under the items, before the totals and signature.
// FOOTER_DISCLAIMER prints at the bottom, under the signature lines.
// Each entry in an array is printed as its own paragraph.

export const BILL_OF_SALE_TITLE = "Bill of Sale"

export const SELLER_DISCLAIMER: string[] = [
  "For good consideration, the receipt and sufficiency of which is acknowledged, the undersigned seller " +
    "(identified above) hereby sells and transfers to the buyer and the buyer's successors and assigns forever " +
    "the personal property described above. The seller warrants to the buyer that the seller has good and " +
    "marketable title to the property, full authority to sell and transfer the property, and that the property " +
    "is sold free of all liens, encumbrances, liabilities and adverse claims of every nature and description whatsoever.",
  "ALL TRANSACTIONS ARE FINAL. Once payment has been made, this sale cannot be cancelled, reversed or refunded, " +
    "and the property described above will not be returned to the seller.",
]

export const FOOTER_DISCLAIMER: string[] = [
  "This business is registered under the laws of the State of Texas and by state law is subject to regulatory " +
    "oversight by the Office of Consumer Credit Commissioner. Any consumer wishing to file a complaint against this " +
    "business may contact the Office of Consumer Credit Commissioner through one of the means indicated below: " +
    "In person or U.S. mail: 2601 N Lamar Blvd, Austin, TX 78705-4207. Tel. No. (800) 538-1579. " +
    "Fax No. (512) 936-7610. Email: consumercomplaint@occc.state.tx.us. Website: www.occc.state.tx.us",
]
