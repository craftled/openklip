#!/usr/bin/env swift
// macOS Vision sidecar: detect the largest face in a JPEG/PNG and print
// normalized focus coords for OpenKlip reframe (focusX left-right, focusY top-bottom).
import Foundation
import Vision
import ImageIO

struct FocusOut: Codable {
  let focusX: Double
  let focusY: Double
  let confidence: Double
}

func loadCGImage(path: String) -> CGImage? {
  let url = URL(fileURLWithPath: path)
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
    return nil
  }
  return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func detectFaceFocus(cgImage: CGImage) -> FocusOut? {
  let request = VNDetectFaceRectanglesRequest()
  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return nil
  }
  guard let faces = request.results as? [VNFaceObservation], !faces.isEmpty else {
    return nil
  }
  // Largest face by bounding-box area (talking-head priority).
  let best = faces.max(by: { a, b in
    let aa = a.boundingBox.width * a.boundingBox.height
    let bb = b.boundingBox.width * b.boundingBox.height
    return aa < bb
  })!
  let box = best.boundingBox
  let centerX = box.minX + box.width / 2
  // Vision uses bottom-left origin; OpenKlip focusY is top-down.
  let centerYFromTop = 1.0 - (box.minY + box.height / 2)
  return FocusOut(
    focusX: min(1, max(0, centerX)),
    focusY: min(1, max(0, centerYFromTop)),
    confidence: Double(best.confidence)
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

if let focus = detectFaceFocus(cgImage: image) {
  let data = try! JSONEncoder().encode(focus)
  print(String(data: data, encoding: .utf8)!)
} else {
  print("{\"error\":\"no face\"}")
}
