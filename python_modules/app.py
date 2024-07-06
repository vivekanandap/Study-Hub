import sys
import fitz  # PyMuPDF
from transformers import pipeline

def extract_text_from_pdf(file_path):
    document = fitz.open(file_path)
    text = ""
    for page_num in range(len(document)):
        page = document.load_page(page_num)
        text += page.get_text()
    return text

def summarize_text(text):
    # Load summarization pipeline with explicit model name
    summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")
    # Summarize in chunks to handle long documents
    max_chunk_size = 1000  # max token size for summarization model
    text_chunks = [text[i:i + max_chunk_size] for i in range(0, len(text), max_chunk_size)]
    summaries = summarizer(text_chunks, max_length=130, min_length=30, do_sample=False)
    summary = " \n".join([s['summary_text'] for s in summaries])
    return summary

if __name__ == '__main__':
    file_path = sys.argv[1]
    pdf_text = extract_text_from_pdf(file_path)
    summary = summarize_text(pdf_text)
    print(summary)
