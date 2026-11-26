// Update your API calls to match new backend structure

export async function getMovies(limit = 20, page = 1) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/movies?limit=${limit}&page=${page}`);
  return response.json();
}

export async function getMovieDetail(id: number) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/movies/${id}`);
  return response.json();
}

export async function addToWatchlist(movieId: number, seriesId: number = null) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/watchlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      movie_id: movieId,
      series_id: seriesId
    })
  });
  return response.json();
}

export async function getWatchlist() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/watchlist`);
  return response.json();
}

export async function checkStreamHealth(url: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/stream/status/${url}`);
  return response.json();
}
