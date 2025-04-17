// firebase-config.js
// Firebase configuration and initialization

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs, Timestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "questivate.firebaseapp.com",
  projectId: "questivate",
  storageBucket: "questivate.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// School domain restriction for authentication
const ALLOWED_DOMAINS = ['school.edu']; // Replace with your school domain

// Admin email configuration
const ADMIN_EMAILS = ['your.email@example.com']; // Replace with your email

/**
 * Authenticate user with Google
 * @returns {Promise} Authentication result
 */
export async function authenticateWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Check if user's email domain is allowed
    const domain = user.email.split('@')[1];
    if (!ALLOWED_DOMAINS.includes(domain)) {
      await signOut(auth);
      throw new Error('Only school accounts are allowed to sign in.');
    }
    
    // Store user data in Firestore
    await addDoc(collection(db, "users"), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastLogin: Timestamp.now(),
      isAdmin: ADMIN_EMAILS.includes(user.email)
    });
    
    return user;
  } catch (error) {
    console.error("Authentication error:", error);
    throw error;
  }
}

/**
 * Check if current user is an admin
 * @returns {Promise<boolean>} Is admin status
 */
export async function isUserAdmin() {
  const user = auth.currentUser;
  if (!user) return false;
  
  return ADMIN_EMAILS.includes(user.email);
}

/**
 * Submit feedback to Firestore
 * @param {Object} feedbackData - The feedback data
 * @returns {Promise} Submission result
 */
export async function submitFeedback(feedbackData) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    
    const submission = await addDoc(collection(db, "feedback"), {
      userId: user.uid,
      userEmail: user.email,
      teacherId: feedbackData.teacherId,
      teacherEmail: feedbackData.teacherEmail,
      feedbackText: feedbackData.feedbackText,
      classId: feedbackData.classId,
      timestamp: Timestamp.now(),
      processed: false,
      summarized: false
    });
    
    return submission;
  } catch (error) {
    console.error("Feedback submission error:", error);
    throw error;
  }
}

/**
 * Get feedback for teacher
 * @param {string} teacherId - Teacher's ID
 * @returns {Promise<Array>} Array of feedback objects
 */
export async function getTeacherFeedback(teacherId) {
  try {
    const feedbackRef = collection(db, "feedback");
    const q = query(
      feedbackRef, 
      where("teacherId", "==", teacherId),
      where("processed", "==", true),
      orderBy("timestamp", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const feedback = [];
    querySnapshot.forEach((doc) => {
      feedback.push({ id: doc.id, ...doc.data() });
    });
    
    return feedback;
  } catch (error) {
    console.error("Error fetching teacher feedback:", error);
    throw error;
  }
}

/**
 * Check for duplicate feedback concerns
 * @param {string} feedbackText - The feedback text to check
 * @returns {Promise<boolean>} Whether similar feedback exists
 */
export async function checkForDuplicateConcerns(feedbackText) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const feedbackRef = collection(db, "feedback");
    const q = query(
      feedbackRef,
      where("timestamp", ">=", Timestamp.fromDate(today)),
      limit(100)
    );
    
    const querySnapshot = await getDocs(q);
    const recentFeedback = [];
    querySnapshot.forEach((doc) => {
      recentFeedback.push(doc.data().feedbackText);
    });
    
    // Simple similarity check (can be enhanced with more sophisticated NLP)
    const similarityThreshold = 0.8;
    const similarCount = recentFeedback.filter(text => {
      return calculateSimilarity(text, feedbackText) > similarityThreshold;
    }).length;
    
    return similarCount > 3; // If more than 3 similar submissions
  } catch (error) {
    console.error("Error checking for duplicate concerns:", error);
    return false;
  }
}

/**
 * Calculate text similarity (simple implementation)
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Alert admins about potential issues
 * @param {string} message - Alert message
 * @param {Object} data - Additional data
 */
export async function alertAdmins(message, data = {}) {
  try {
    await addDoc(collection(db, "adminAlerts"), {
      message,
      data,
      timestamp: Timestamp.now(),
      addressed: false
    });
    console.log("Admin alert created");
  } catch (error) {
    console.error("Error creating admin alert:", error);
  }
}

export { auth, db, onAuthStateChanged };
