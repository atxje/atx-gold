let cachedToken: string | null = null
let tokenExpiry = 0

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const res = await fetch("https://authztoken.api.rapaport.com/api/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.RAPAPORT_CLIENT_ID,
      client_secret: process.env.RAPAPORT_CLIENT_SECRET,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Rapaport auth failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  // Token lasts ~8 hours, refresh 10 min early
  tokenExpiry = Date.now() + ((data.expires_in || 28800) - 600) * 1000
  return cachedToken!
}

export interface RapPrice {
  shape: string
  lowSize: number
  highSize: number
  color: string
  clarity: string
  caratPrice: number
  date: string
}

/**
 * Fetch Rapaport price per carat for a diamond.
 * Shape: "Round" or "Pear" (Pear is proxy for all fancy shapes).
 * Color: D-M. Clarity: IF, VVS1..I3.
 */
export async function getRapPrice(
  shape: string,
  size: number,
  color: string,
  clarity: string,
): Promise<RapPrice> {
  const token = await getToken()

  // Rapaport only has Round and Pear lists
  const rapShape = shape === "Round" ? "Round" : "Pear"

  const params = new URLSearchParams({
    shape: rapShape,
    size: size.toString(),
    color: color.toLowerCase(),
    clarity: clarity.toLowerCase(),
  })

  const res = await fetch(
    `https://technet.rapnetapis.com/pricelist/api/Prices?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Rapaport price lookup failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return {
    shape: data.shape,
    lowSize: data.low_size,
    highSize: data.high_size,
    color: data.color,
    clarity: data.clarity,
    caratPrice: parseFloat(data.caratprice),
    date: data.date,
  }
}
