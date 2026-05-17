import UIKit

struct PDFBuilder {
    static func makePDF(from images: [UIImage]) -> Data {
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: CGSize(width: 612, height: 792)))
        return renderer.pdfData { context in
            for image in images {
                context.beginPage()
                let pageBounds = context.pdfContextBounds
                let imageRect = aspectFitRect(imageSize: image.size, in: pageBounds.insetBy(dx: 24, dy: 24))
                image.draw(in: imageRect)
            }
        }
    }

    private static func aspectFitRect(imageSize: CGSize, in bounds: CGRect) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else {
            return bounds
        }
        let scale = min(bounds.width / imageSize.width, bounds.height / imageSize.height)
        let width = imageSize.width * scale
        let height = imageSize.height * scale
        return CGRect(
            x: bounds.midX - width / 2,
            y: bounds.midY - height / 2,
            width: width,
            height: height
        )
    }
}
