import pytesseract
from PIL import ImageGrab
import cv2
import numpy as np
import time
import requests
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Path to the Tesseract executable
pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'

# Function to capture the screen
def capture_screen():
    screenshot = ImageGrab.grab()
    return np.array(screenshot)

# Function to extract text regions from an image using Tesseract
def extract_text_regions(image):
    gray_image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Apply Otsu's thresholding to binarize the grayscale image
    # _, binary_image = cv2.threshold(gray_image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Apply adaptive thresholding to binarize the grayscale image
    # binary_image = cv2.adaptiveThreshold(gray_image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)

    #Adaptive Thresholding with Different Block Size and Constant
    binary_image = cv2.adaptiveThreshold(gray_image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 4)

    
    contours, _ = cv2.findContours(binary_image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    text_regions = [cv2.boundingRect(contour) for contour in contours]
    return text_regions

# Function to calculate the area covered by text
def calculate_text_area(text_regions, image_shape):
    text_area = sum(w * h for x, y, w, h in text_regions)
    total_area = image_shape[0] * image_shape[1]
    return text_area / total_area

# Function to count the number of words detected in the image
def count_words(image):
    gray_image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    custom_config = r'--oem 3 --psm 6'
    text = pytesseract.image_to_string(gray_image, config=custom_config)
    words = text.split()
    return len(words)

# Main function to capture screen, extract text, and determine if reading
def main():
    while True:
        try:
            # Capture the screen
            image = capture_screen()
            # logging.debug("Screen captured successfully.")
            
            # Extract text regions from the screen
            text_regions = extract_text_regions(image)
            # logging.debug(f"Extracted {len(text_regions)} text regions.")
            
            # Calculate the text area proportion
            text_area_proportion = calculate_text_area(text_regions, image.shape)
            logging.debug(f"Text area proportion: {text_area_proportion:.2f}")
            
            # Count the number of words
            num_words = count_words(image)
            logging.debug(f"Number of words: {num_words}")

            # Determine if the user is reading
            status = "Reading" if (num_words >= 60 and 0.31 <= text_area_proportion <= 1.00) else "Not Reading"
            is_reading = status == "Reading"

            logging.info(f"Reading status: {status}")

            # # Send the status to the Node.js server
            try:
                response = requests.post('http://localhost:5000/reading-status', json={'is_reading': is_reading})
                response.raise_for_status()
                logging.debug("Status posted successfully.")
            except requests.RequestException as e:
                logging.error(f"Failed to connect to the server: {e}")

        except Exception as e:
            logging.error(f"Error in OCR process: {e}")

        # Wait for 3 seconds before the next check
        time.sleep(3)

if __name__ == "__main__":
    main()
