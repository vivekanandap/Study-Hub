from transformers import pipeline

def predownload_model():
    summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")
    print("Model downloaded and cached.")

if __name__ == '__main__':
    predownload_model()
