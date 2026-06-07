import * as faceapi from 'face-api.js'

const MODEL_URL = '/models'
let modelsLoaded = false

export async function loadFaceApiModels(): Promise<void> {
  if (modelsLoaded) return
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ])
  modelsLoaded = true
}

// Get 128-d descriptor from any image source (video, canvas, img element, or URL string)
// Returns null if no face found
export async function getDescriptorFromElement(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<Float32Array | null> {
  const detection = await faceapi
    .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
  return detection?.descriptor ?? null
}

// Get descriptor from image URL (for registration validation)
export async function getDescriptorFromUrl(url: string): Promise<Float32Array | null> {
  const img = await faceapi.fetchImage(url)
  return getDescriptorFromElement(img)
}

export interface MatchResult {
  personId: string
  distance: number
}

// Find best matching person from a list. Returns null if no match below threshold.
export function findBestMatch(
  descriptor: Float32Array,
  people: Array<{ id: string; face_descriptor: number[] | null }>,
  threshold: number
): MatchResult | null {
  let best: MatchResult | null = null
  for (const person of people) {
    if (!person.face_descriptor || person.face_descriptor.length === 0) continue
    const stored = new Float32Array(person.face_descriptor)
    const dist = faceapi.euclideanDistance(descriptor, stored)
    if (dist < threshold && (!best || dist < best.distance)) {
      best = { personId: person.id, distance: dist }
    }
  }
  return best
}
