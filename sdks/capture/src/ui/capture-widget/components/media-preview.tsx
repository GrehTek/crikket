export function MediaPreview(props: {
  media: {
    captureType: "video" | "screenshot"
    objectUrl: string
  } | null
}): React.JSX.Element | null {
  if (props.media?.captureType === "video") {
    return (
      <video
        className="block h-full max-h-full w-full bg-black object-contain"
        controls
        playsInline
        preload="metadata"
        src={props.media.objectUrl}
      >
        <track kind="captions" label="English" src="data:text/vtt,WEBVTT" />
      </video>
    )
  }

  if (props.media?.captureType === "screenshot") {
    return (
      <img
        alt="Captured screenshot"
        className="block h-full max-h-full w-full object-contain"
        src={props.media.objectUrl}
      />
    )
  }

  return null
}
