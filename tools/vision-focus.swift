#!/usr/bin/env swift
// macOS Vision sidecar: face or saliency focus + optional on-frame OCR text.
import Foundation
import Vision
import ImageIO

struct FocusOut: Codable {
  let focusX: Double
  let focusY: Double
  let confidence: Double
  let source: String
  let ocrText: [String]?
}

func loadCGImage(path: String) -> CGImage? {
  let url = URL(fileURLWithPath: path)
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
    return nil
  }
  return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func centerFromBox(_ box: CGRect) -> (x: Double, y: Double) {
  let centerX = box.minX + box.width / 2
  let centerYFromTop = 1.0 - (box.minY + box.height / 2)
  return (
    min(1, max(0, centerX)),
    min(1, max(0, centerYFromTop))
  )
}

func detectFaceFocus(cgImage: CGImage) -> (FocusOut)? {
  let request = VNDetectFaceRectanglesRequest()
  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return nil
  }
  guard let faces = request.results, !faces.isEmpty else {
    return nil
  }
  let best = faces.max(by: { a, b in
    let aa = a.boundingBox.width * a.boundingBox.height
    let bb = b.boundingBox.width * b.boundingBox.height
    return aa < bb
  })!
  let (x, y) = centerFromBox(best.boundingBox)
  return FocusOut(
    focusX: x,
    focusY: y,
    confidence: Double(best.confidence),
    source: "face",
    ocrText: nil
  )
}

func detectSaliencyFocus(cgImage: CGImage) -> FocusOut? {
  let request = VNGenerateAttentionBasedSaliencyImageRequest()
  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return nil
  }
  guard let obs = request.results?.first as? VNSaliencyImageObservation else {
    return nil
  }
  let objects = obs.salientObjects ?? []
  guard !objects.isEmpty else {
    return nil
  }
  let best = objects.max(by: { a, b in
    let aa = a.boundingBox.width * a.boundingBox.height
    let bb = b.boundingBox.width * b.boundingBox.height
    return aa < bb
  })!
  let (x, y) = centerFromBox(best.boundingBox)
  return FocusOut(
    focusX: x,
    focusY: y,
    confidence: Double(best.confidence),
    source: "saliency",
    ocrText: nil
  )
}

func recognizeText(cgImage: CGImage) -> [String] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return []
  }
  guard let results = request.results else {
    return []
  }
  var lines: [String] = []
  for obs in results {
    guard let top = obs.topCandidates(1).first else { continue }
    let text = top.string.trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty {
      lines.append(text)
    }
  }
  return Array(lines.prefix(8))
}

func detectFocus(cgImage: CGImage) -> FocusOut? {
  let ocr = recognizeText(cgImage: cgImage)
  if let faceOrSal = detectFaceFocus(cgImage: cgImage) ?? detectSaliencyFocus(cgImage: cgImage) {
    return FocusOut(
      focusX: faceOrSal.focusX,
      focusY: faceOrSal.focusY,
      confidence: faceOrSal.confidence,
      source: faceOrSal.source,
      ocrText: ocr.isEmpty ? nil : ocr
    )
  }
  if ocr.isEmpty {
    return nil
  }
  return FocusOut(
    focusX: 0.5,
    focusY: 0.5,
    confidence: 0.4,
    source: "ocr",
    ocrText: ocr
  )
}

guard CommandLine.arguments.count >= 2 else {
  fputs("usage: vision-focus <image-path>\n", stderr)
  exit(2)
}

let path = CommandLine.arguments[1]
guard let image = loadCGImage(path: path) else {
  fputs("{\"error\":\"cannot load image\"}\n", stderr)
  exit(1)
}

if let focus = detectFocus(cgImage: image) {
  let data = try! JSONEncoder().encode(focus)
  print(String(data: data, encoding: .utf8)!)
} else {
  print("{\"error\":\"no focus\"}")
}
