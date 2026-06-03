import { NextResponse } from "next/server";
import { fetchPlaceSuggestions } from "@/lib/geoapify";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    console.log("AUTOCOMPLETE query:", query);

    if (query.length < 2) {
      console.log("AUTOCOMPLETE short query");
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = await fetchPlaceSuggestions(query);
    console.log("AUTOCOMPLETE suggestions:", suggestions);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Autocomplete route error:", error);

    return NextResponse.json(
      {
        error: "We couldn’t load place suggestions right now.",
        suggestions: [],
      },
      { status: 500 }
    );
  }
}