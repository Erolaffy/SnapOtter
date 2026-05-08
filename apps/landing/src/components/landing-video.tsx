"use client";
import { useEffect, useRef, useState } from "react";

interface LandingVideoProps {
  slug: string;
  className?: string;
  priority?: boolean;
}

export function LandingVideo({ slug, className, priority = false }: LandingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(priority);

  useEffect(() => {
    if (priority || !videoRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, [priority]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      loop
      playsInline
      tabIndex={-1}
      poster={`/videos/${slug}-poster.webp`}
      className={`motion-safe:block motion-reduce:hidden ${className ?? ""}`}
      aria-hidden="true"
    >
      {isVisible && (
        <>
          <source src={`/videos/${slug}.webm`} type="video/webm" />
          <source src={`/videos/${slug}.mp4`} type="video/mp4" />
        </>
      )}
    </video>
  );
}
