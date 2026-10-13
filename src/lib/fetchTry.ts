const APP_URL = "https://api.trakt.tv";

export async function getTrendingMovies() {
  try {
    const response = await fetch(`${APP_URL}/movies/trending`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": process.env.EXPO_PUBLIC_CLIENT_ID!,
        "User-Agent": "Moov/1.0.0",
      },
    });

    const responseText = await response.text();

    console.log("Status:", response.status);
    console.log("Response:", responseText);

    if (!response.ok) {
      throw new Error(`Trakt API error: ${response.status}`);
    }

    return JSON.parse(responseText);
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}