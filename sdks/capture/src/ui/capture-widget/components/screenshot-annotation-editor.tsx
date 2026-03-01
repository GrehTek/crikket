import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  clampAnnotationPoint,
  drawScreenshotAnnotations,
  type ScreenshotAnnotation,
} from "../utils/screenshot-annotations"
import { Button } from "./primitives/button"
import { cn } from "./primitives/cn"

type AnnotationTool = "draw" | "highlight" | "rectangle"

const DEFAULT_TOOL: AnnotationTool = "draw"

export function ScreenshotAnnotationEditor(props: {
  annotations: ScreenshotAnnotation[]
  disabled: boolean
  onChange: (annotations: ScreenshotAnnotation[]) => void
  src: string
}): React.JSX.Element {
  const annotationsRef = useRef(props.annotations)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rectangleOriginRef = useRef<{ x: number; y: number } | null>(null)
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null)
  const [tool, setTool] = useState<AnnotationTool>(DEFAULT_TOOL)
  const [draftAnnotation, setDraftAnnotation] =
    useState<ScreenshotAnnotation | null>(null)
  const draftAnnotationRef = useRef<ScreenshotAnnotation | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(0)

  useEffect(() => {
    annotationsRef.current = props.annotations
  }, [props.annotations])

  useEffect(() => {
    draftAnnotationRef.current = draftAnnotation
  }, [draftAnnotation])

  useEffect(() => {
    let active = true
    const image = new Image()
    image.decoding = "async"
    image.onload = () => {
      if (!active) {
        return
      }

      setLoadedImage(image)
    }
    image.onerror = () => {
      if (!active) {
        return
      }

      setLoadedImage(null)
    }
    image.src = props.src

    return () => {
      active = false
    }
  }, [props.src])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setCanvasWidth(Math.floor(entry.contentRect.width))
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  const aspectRatio =
    loadedImage && loadedImage.naturalWidth > 0
      ? loadedImage.naturalHeight / loadedImage.naturalWidth
      : 9 / 16
  const displayWidth = Math.max(canvasWidth, 1)
  const displayHeight = Math.max(Math.round(displayWidth * aspectRatio), 1)
  const renderedAnnotations = useMemo(() => {
    return draftAnnotation
      ? [...props.annotations, draftAnnotation]
      : props.annotations
  }, [draftAnnotation, props.annotations])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!(canvas && loadedImage)) {
      return
    }

    const context = canvas.getContext("2d")
    if (!context) {
      return
    }

    const devicePixelRatio = window.devicePixelRatio || 1
    canvas.width = Math.round(displayWidth * devicePixelRatio)
    canvas.height = Math.round(displayHeight * devicePixelRatio)
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    drawScreenshotAnnotations({
      annotations: renderedAnnotations,
      context,
      height: displayHeight,
      image: loadedImage,
      width: displayWidth,
    })
  }, [displayHeight, displayWidth, loadedImage, renderedAnnotations])

  const commitDraftAnnotation = (annotation: ScreenshotAnnotation | null) => {
    if (!annotation) {
      return
    }

    props.onChange([...annotationsRef.current, annotation])
    setDraftAnnotation(null)
    draftAnnotationRef.current = null
    rectangleOriginRef.current = null
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (props.disabled || !loadedImage || event.button !== 0) {
      return
    }

    const point = toCanvasPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (tool === "rectangle") {
      rectangleOriginRef.current = point
      setDraftAnnotation({
        kind: "rectangle",
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      })
      return
    }

    setDraftAnnotation({
      kind: "stroke",
      points: [point],
      tool,
    })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!(draftAnnotation && loadedImage)) {
      return
    }

    const point = toCanvasPoint(event)
    if (draftAnnotation.kind === "rectangle") {
      const origin = rectangleOriginRef.current ?? {
        x: draftAnnotation.x,
        y: draftAnnotation.y,
      }
      setDraftAnnotation({
        kind: "rectangle",
        x: Math.min(origin.x, point.x),
        y: Math.min(origin.y, point.y),
        width: Math.abs(point.x - origin.x),
        height: Math.abs(point.y - origin.y),
      })
      return
    }

    setDraftAnnotation({
      ...draftAnnotation,
      points: [...draftAnnotation.points, point],
    })
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const activeDraft = draftAnnotationRef.current
    if (!activeDraft) {
      return
    }

    const point = toCanvasPoint(event)
    const finalizedDraft =
      activeDraft.kind === "stroke"
        ? {
            ...activeDraft,
            points: [...activeDraft.points, point],
          }
        : activeDraft

    if (
      finalizedDraft.kind === "rectangle" &&
      (finalizedDraft.width < 0.01 || finalizedDraft.height < 0.01)
    ) {
      setDraftAnnotation(null)
      draftAnnotationRef.current = null
      rectangleOriginRef.current = null
      return
    }

    commitDraftAnnotation(finalizedDraft)
  }

  const hasAnnotations = props.annotations.length > 0

  return (
    <div className="grid gap-0">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-3">
        <ToolButton
          active={tool === "draw"}
          disabled={props.disabled}
          onClick={() => {
            setTool("draw")
          }}
        >
          Draw
        </ToolButton>
        <ToolButton
          active={tool === "highlight"}
          disabled={props.disabled}
          onClick={() => {
            setTool("highlight")
          }}
        >
          Highlight
        </ToolButton>
        <ToolButton
          active={tool === "rectangle"}
          disabled={props.disabled}
          onClick={() => {
            setTool("rectangle")
          }}
        >
          Rectangle
        </ToolButton>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            disabled={props.disabled || !hasAnnotations}
            onClick={() => {
              props.onChange(props.annotations.slice(0, -1))
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Undo
          </Button>
          <Button
            disabled={props.disabled || !hasAnnotations}
            onClick={() => {
              props.onChange([])
              setDraftAnnotation(null)
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="bg-muted/20 p-4">
        <div className="mx-auto max-w-full" ref={containerRef}>
          <canvas
            aria-label="Screenshot annotation editor"
            className={cn(
              "block w-full rounded-lg bg-white shadow-sm",
              props.disabled ? "cursor-default" : "cursor-crosshair"
            )}
            onPointerCancel={handlePointerEnd}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            ref={canvasRef}
            style={{
              touchAction: "none",
            }}
          />
        </div>
      </div>
    </div>
  )

  function toCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>): {
    x: number
    y: number
  } {
    const rect = event.currentTarget.getBoundingClientRect()
    return clampAnnotationPoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    })
  }
}

function ToolButton(props: {
  active: boolean
  children: React.ReactNode
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button
      className={cn(
        props.active ? "border-transparent bg-foreground text-background" : null
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      size="sm"
      type="button"
      variant={props.active ? "secondary" : "outline"}
    >
      {props.children}
    </Button>
  )
}
