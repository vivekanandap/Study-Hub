import cv2
import requests
import time

# Load pre-trained Haar Cascade classifiers for face and eye detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

# Function to detect face and eyes
def detect_face_and_eyes(gray, frame):
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)
    if len(faces) == 0:
        print("No faces detected")
    else:
        print(f"Detected {len(faces)} face(s)")

    for (x, y, w, h) in faces:
        roi_gray = gray[y:y+h, x:x+w]
        eyes = eye_cascade.detectMultiScale(roi_gray)
        if len(eyes) >= 2:
            print("Detected eyes")
            return True
    return False

# Initialize webcam
cap = cv2.VideoCapture(0)
server_url = 'http://localhost:5000/detection-status'

while True:
    ret, frame = cap.read()
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    is_looking = detect_face_and_eyes(gray, frame)
    
    # Send detection status to the server
    try:
        requests.post(server_url, json={'is_looking': is_looking})
    except requests.exceptions.RequestException as e:
        print(f"Error sending data: {e}")

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

    time.sleep(3)

cap.release()
cv2.destroyAllWindows()