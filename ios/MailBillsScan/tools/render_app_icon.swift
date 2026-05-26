import AppKit
import Foundation

private let canvasSize = CGSize(width: 1024, height: 1024)

private let charcoal = NSColor(
  srgbRed: 0.12,
  green: 0.12,
  blue: 0.11,
  alpha: 1
)
private let outerCharcoal = NSColor(
  srgbRed: 0.08,
  green: 0.08,
  blue: 0.07,
  alpha: 1
)
private let linen = NSColor(
  srgbRed: 0.95,
  green: 0.92,
  blue: 0.87,
  alpha: 1
)
private let amber = NSColor(
  srgbRed: 0.80,
  green: 0.58,
  blue: 0.23,
  alpha: 1
)

private func point(_ x: CGFloat, _ y: CGFloat) -> NSPoint {
  NSPoint(x: x, y: y)
}

private func drawBackground(in rect: NSRect) {
  outerCharcoal.setFill()
  rect.fill()

  let panelInset: CGFloat = 56
  let panelRect = rect.insetBy(dx: panelInset, dy: panelInset)
  let background = NSBezierPath(
    roundedRect: panelRect,
    xRadius: 176,
    yRadius: 176
  )
  charcoal.setFill()
  background.fill()

  linen.withAlphaComponent(0.06).setStroke()
  background.lineWidth = 4
  background.stroke()
}

private func addBracket(
  to path: NSBezierPath,
  x: CGFloat,
  y: CGFloat,
  dx: CGFloat,
  dy: CGFloat,
  length: CGFloat
) {
  path.move(to: point(x + (dx * length), y))
  path.line(to: point(x, y))
  path.line(to: point(x, y + (dy * length)))
}

private func drawBrackets(size: CGSize) {
  let inset: CGFloat = 174
  let length: CGFloat = 106

  let bracketPath = NSBezierPath()
  bracketPath.lineCapStyle = .round
  bracketPath.lineJoinStyle = .round
  bracketPath.lineWidth = 18

  linen.withAlphaComponent(0.18).setStroke()
  addBracket(
    to: bracketPath,
    x: inset,
    y: size.height - inset,
    dx: 1,
    dy: -1,
    length: length
  )
  addBracket(
    to: bracketPath,
    x: size.width - inset,
    y: size.height - inset,
    dx: -1,
    dy: -1,
    length: length
  )
  addBracket(
    to: bracketPath,
    x: inset,
    y: inset,
    dx: 1,
    dy: 1,
    length: length
  )
  addBracket(
    to: bracketPath,
    x: size.width - inset,
    y: inset,
    dx: -1,
    dy: 1,
    length: length
  )
  bracketPath.stroke()
}

private func drawM() {
  let mPath = NSBezierPath()
  mPath.move(to: point(244, 276))
  mPath.line(to: point(244, 760))
  mPath.line(to: point(332, 760))
  mPath.line(to: point(390, 552))
  mPath.line(to: point(424, 552))
  mPath.line(to: point(482, 760))
  mPath.line(to: point(570, 760))
  mPath.line(to: point(570, 276))
  mPath.line(to: point(486, 276))
  mPath.line(to: point(486, 614))
  mPath.line(to: point(446, 614))
  mPath.line(to: point(408, 468))
  mPath.line(to: point(370, 614))
  mPath.line(to: point(330, 614))
  mPath.line(to: point(330, 276))
  mPath.close()

  linen.setFill()
  mPath.fill()
}

private func drawRoundedRect(_ rect: NSRect, radius: CGFloat, color: NSColor) {
  let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
  color.setFill()
  path.fill()
}

private func drawB() {
  drawRoundedRect(NSRect(x: 606, y: 276, width: 88, height: 484), radius: 44, color: linen)
  drawRoundedRect(NSRect(x: 606, y: 516, width: 218, height: 244), radius: 112, color: linen)
  drawRoundedRect(NSRect(x: 606, y: 276, width: 244, height: 262), radius: 126, color: linen)

  drawRoundedRect(NSRect(x: 680, y: 580, width: 84, height: 108), radius: 40, color: charcoal)
  drawRoundedRect(NSRect(x: 680, y: 344, width: 104, height: 120), radius: 50, color: charcoal)

  drawRoundedRect(NSRect(x: 716, y: 358, width: 62, height: 62), radius: 31, color: amber)
}

private func renderIcon() throws -> NSBitmapImageRep {
  let width = Int(canvasSize.width)
  let height = Int(canvasSize.height)
  guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
    throw NSError(domain: "RenderError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not create sRGB color space."])
  }
  let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue)

  guard let cgContext = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: width * 4,
    space: colorSpace,
    bitmapInfo: bitmapInfo.rawValue
  ) else {
    throw NSError(domain: "RenderError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create bitmap context."])
  }

  let context = NSGraphicsContext(cgContext: cgContext, flipped: false)

  NSGraphicsContext.saveGraphicsState()
  defer { NSGraphicsContext.restoreGraphicsState() }

  NSGraphicsContext.current = context
  cgContext.interpolationQuality = .high
  cgContext.setShouldAntialias(true)

  let canvasRect = NSRect(origin: .zero, size: canvasSize)
  drawBackground(in: canvasRect)
  drawBrackets(size: canvasSize)
  drawM()
  drawB()

  guard let cgImage = cgContext.makeImage() else {
    throw NSError(domain: "RenderError", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not create rendered image."])
  }

  return NSBitmapImageRep(cgImage: cgImage)
}

private func writePNG(to outputURL: URL) throws {
  let bitmap = try renderIcon()

  guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "RenderError", code: 4, userInfo: [NSLocalizedDescriptionKey: "Could not encode PNG data."])
  }

  try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true,
    attributes: nil
  )
  try pngData.write(to: outputURL, options: .atomic)
}

guard CommandLine.arguments.count == 2 else {
  fputs("Usage: swift render_app_icon.swift <output-path>\n", stderr)
  exit(64)
}

do {
  let outputURL = URL(fileURLWithPath: CommandLine.arguments[1])
  try writePNG(to: outputURL)
} catch {
  fputs("render_app_icon.swift: \(error.localizedDescription)\n", stderr)
  exit(1)
}
