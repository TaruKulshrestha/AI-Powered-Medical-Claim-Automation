import pytesseract
from pdf2image import convert_from_path
import os
from database import mongo_db  # your MongoDB connection

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

PDF_FOLDER = "../uploads/bills"

def process_pdf(file_name):
    pdf_path = os.path.join(PDF_FOLDER, file_name)

    images = convert_from_path(
        pdf_path,
        poppler_path=r"C:\poppler\poppler\Library\bin"
    )

    text = ""
    for img in images:
        text += pytesseract.image_to_string(img)

    mongo_db.medical_bills.insert_one({
        "file_name": file_name,
        "ocr_text": text
    })

    print(f"{file_name} saved to MongoDB")

# Process all PDFs in the folder
for file in os.listdir(PDF_FOLDER):
    if file.endswith(".pdf"):
        process_pdf(file)
