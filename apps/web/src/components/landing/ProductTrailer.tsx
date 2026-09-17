import { useState } from 'react'
import { Play } from 'lucide-react'

export const TRAILER_URL = '/media/nubols-trailer-v1.mp4'
export const TRAILER_POSTER = '/media/nubols-trailer-v1.webp'

export function ProductTrailer() {
  const [started, setStarted] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <div className="group relative mx-auto aspect-video w-full overflow-hidden rounded-[2rem] bg-black shadow-[0_30px_100px_rgba(0,0,0,0.35)] min-[1100px]:w-[61.5rem] min-[1200px]:w-[73rem]">
      {started ? (
        <video
          className="h-full w-full object-contain"
          src={TRAILER_URL}
          poster={TRAILER_POSTER}
          controls
          playsInline
          autoPlay
          preload="metadata"
          aria-label="Nubols product walkthrough — 1 minute 13 seconds, no audio"
          onError={() => setFailed(true)}
        >
          <a href={TRAILER_URL}>Watch the Nubols product walkthrough</a>
        </video>
      ) : (
        <button
          type="button"
          onClick={() => setStarted(true)}
          aria-label="Play Nubols product walkthrough — 1 minute 13 seconds, no audio"
          className="absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-white"
        >
          <img src={TRAILER_POSTER} alt="" width={1280} height={720} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/15">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out group-hover:scale-105 sm:h-20 sm:w-20">
              <Play aria-hidden="true" className="ml-1 h-6 w-6 fill-current sm:h-7 sm:w-7" strokeWidth={1.8} />
            </span>
          </span>
          <span className="absolute bottom-4 right-4 rounded-lg bg-black/70 px-3 py-1 text-xs text-white">1:13 · No audio</span>
        </button>
      )}
      {failed && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center text-sm text-white">
          <a href={TRAILER_URL} className="underline underline-offset-4">Playback unavailable. Open the video directly.</a>
        </div>
      )}
    </div>
  )
}
