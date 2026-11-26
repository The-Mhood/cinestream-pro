// Update your movie detail page to use real data
import { getMovieDetail } from '@/lib/api';

export default async function MovieDetail({ params }: { params: { id: string } }) {
  const data = await getMovieDetail(parseInt(params.id));
  
  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Movie Info */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <img 
            src={data.movie.poster_path} 
            alt={data.movie.title} 
            className="w-32 h-48 object-cover rounded-lg"
          />
          <div>
            <h1 className="text-3xl font-display font-bold mb-2">{data.movie.title}</h1>
            <p className="text-gray-300 mb-4 line-clamp-3">{data.movie.overview}</p>
            <div className="flex gap-4">
              <button className="bg-gold text-dark-900 px-4 py-2 rounded hover:bg-white transition">
                Watch Now
              </button>
              <button className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 transition">
                Add to Watchlist
              </button>
            </div>
          </div>
        </div>

        {/* Source Selection */}
        <div className="bg-dark-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-bold mb-4">Select Streaming Source</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.sources.map((src: any) => (
              <button 
                key={src.url}
                onClick={() => window.location.hash = `source-${src.url}`}
                className="flex justify-between items-center p-3 bg-dark-700 rounded hover:bg-gray-600 transition"
              >
                <span className="font-semibold">{src.provider} - {src.quality}</span>
                <span className={`text-xs px-2 py-1 rounded ${src.is_active ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                  {src.is_active ? 'Active' : 'Offline'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
