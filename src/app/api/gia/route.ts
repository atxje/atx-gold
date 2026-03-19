import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const GIA_ENDPOINT = "https://api.reportresults.gia.edu/"
const GIA_API_KEY = process.env.GIA_API_KEY || ""

const REPORT_QUERY = `
query ReportQuery($ReportNumber: String!) {
  getReport(report_number: $ReportNumber) {
    report_number
    report_date
    report_type
    results {
      __typename
      ... on DiamondGradingReportResults {
        shape_and_cutting_style
        carat_weight
        color_grade
        clarity_grade
        cut_grade
        polish
        symmetry
        fluorescence
        measurements
      }
      ... on LabGrownDiamondGradingReportResults {
        shape_and_cutting_style
        carat_weight
        color_grade
        clarity_grade
        cut_grade
        polish
        symmetry
        fluorescence
        measurements
      }
    }
  }
}
`

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const reportNumber = searchParams.get("reportNumber")

  if (!reportNumber) {
    return NextResponse.json({ error: "reportNumber is required" }, { status: 400 })
  }

  if (!GIA_API_KEY) {
    return NextResponse.json({ error: "GIA API key not configured" }, { status: 500 })
  }

  try {
    const res = await fetch(GIA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": GIA_API_KEY,
      },
      body: JSON.stringify({
        query: REPORT_QUERY,
        variables: { ReportNumber: reportNumber },
      }),
    })

    if (res.status === 403) {
      return NextResponse.json({ error: "Invalid GIA API key" }, { status: 403 })
    }
    if (res.status === 429) {
      return NextResponse.json({ error: "GIA rate limit — try again shortly" }, { status: 429 })
    }

    const data = await res.json()

    if (data.errors?.length) {
      const err = data.errors[0]
      return NextResponse.json({
        error: err.message || "GIA report not found",
        errorType: err.extensions?.errorType,
      }, { status: 404 })
    }

    const report = data.data?.getReport
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    const r = report.results
    if (!r) {
      return NextResponse.json({ error: `Unsupported report type: ${report.report_type}` }, { status: 400 })
    }

    // Normalize shape to match our dropdown values
    const shapeRaw = (r.shape_and_cutting_style || "").toLowerCase()
    const SHAPE_MAP: Record<string, string> = {
      "round brilliant": "Round", "round": "Round",
      "princess": "Princess", "cushion": "Cushion", "cushion modified brilliant": "Cushion",
      "cushion brilliant": "Cushion", "oval": "Oval", "oval brilliant": "Oval",
      "emerald": "Emerald", "pear": "Pear", "pear brilliant": "Pear",
      "marquise": "Marquise", "marquise brilliant": "Marquise",
      "radiant": "Radiant", "cut-cornered rectangular modified brilliant": "Radiant",
      "asscher": "Asscher", "square emerald": "Asscher",
      "heart": "Heart", "heart brilliant": "Heart",
    }
    const shape = SHAPE_MAP[shapeRaw] || "Other"

    // Normalize fluorescence
    const fluoRaw = (r.fluorescence || "").toLowerCase()
    const FLUO_MAP: Record<string, string> = {
      "none": "None", "faint": "Faint", "medium": "Medium",
      "medium blue": "Medium", "strong": "Strong", "strong blue": "Strong",
      "very strong": "Very Strong", "very strong blue": "Very Strong",
    }
    const fluorescence = FLUO_MAP[fluoRaw] || r.fluorescence || ""

    // Normalize cut/polish/symmetry grades
    const GRADE_MAP: Record<string, string> = {
      "excellent": "Excellent", "very good": "Very Good",
      "good": "Good", "fair": "Fair", "poor": "Poor",
    }
    const normalize = (v: string) => GRADE_MAP[v?.toLowerCase()] || v || ""

    return NextResponse.json({
      reportNumber: report.report_number,
      reportDate: report.report_date,
      reportType: report.report_type,
      shape,
      shapeRaw: r.shape_and_cutting_style,
      caratWeight: r.carat_weight || "",
      color: r.color_grade || "",
      clarity: r.clarity_grade || "",
      cutGrade: normalize(r.cut_grade),
      polish: normalize(r.polish),
      symmetry: normalize(r.symmetry),
      fluorescence,
      measurements: r.measurements || "",
    })
  } catch (error) {
    console.error("GIA API error:", error)
    return NextResponse.json({ error: "Failed to fetch GIA report" }, { status: 500 })
  }
}
