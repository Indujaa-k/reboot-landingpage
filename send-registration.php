<?php
/**
 * send-registration.php
 * ---------------------------------------------------------------
 * Receives the registration modal's JSON payload from index.html
 * and emails it via SMTP using PHPMailer.
 *
 * SETUP (required before this will actually send email):
 *
 * 1. Install PHPMailer (recommended, via Composer):
 *      composer require phpmailer/phpmailer
 *    If you don't use Composer, download PHPMailer manually from
 *    https://github.com/PHPMailer/PHPMailer and adjust the
 *    require paths below.
 *
 * 2. Fill in your real SMTP credentials in the CONFIG block below.
 *    - For Gmail: use an "App Password" (not your normal password),
 *      host smtp.gmail.com, port 587, TLS.
 *    - For a custom domain (e.g. your hosting provider / Zoho /
 *      Outlook), use the SMTP details they give you.
 *
 * 3. Upload this file to the same server/folder as index.html and
 *    make sure PHP + the vendor/ folder are available there.
 *
 * 4. Test it directly (e.g. with curl or Postman) before relying
 *    on the on-site form.
 *
 * NOTE: This file will NOT send real email until you complete the
 * steps above. Until then, the front-end will show a friendly
 * "couldn't send" message and the person can call/WhatsApp instead.
 * ---------------------------------------------------------------
 */

header("Content-Type: application/json");

// Only accept POST requests
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid request body"]);
    exit;
}

// ---- Basic validation ----
$name  = trim($input["name"] ?? "");
$phone = trim($input["phone"] ?? "");
$email = trim($input["email"] ?? "");
$type  = trim($input["registration_type"] ?? "Camp Only");
$msg   = trim($input["message"] ?? "");

if ($name === "" || $phone === "" || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(["success" => false, "error" => "Please fill in a valid name, phone, and email."]);
    exit;
}

// ---- Load PHPMailer (Composer autoload) ----
require __DIR__ . "/vendor/autoload.php";

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

// =================================================================
// CONFIG — replace every placeholder below with your real values
// =================================================================
$SMTP_HOST       = "smtp.yourprovider.com";   // e.g. smtp.gmail.com
$SMTP_PORT       = 587;                        // 587 for TLS, 465 for SSL
$SMTP_SECURE     = PHPMailer::ENCRYPTION_STARTTLS; // or ENCRYPTION_SMTPS for port 465
$SMTP_USERNAME   = "your-smtp-username@yourdomain.com";
$SMTP_PASSWORD   = "your-smtp-password-or-app-password";

$MAIL_FROM       = "your-smtp-username@yourdomain.com";
$MAIL_FROM_NAME  = "Reboot Mental Health Center";
$MAIL_TO         = "reception@rebootmentalhealth.example"; // where registrations land
// =================================================================

$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->isSMTP();
    $mail->Host       = $SMTP_HOST;
    $mail->SMTPAuth   = true;
    $mail->Username   = $SMTP_USERNAME;
    $mail->Password   = $SMTP_PASSWORD;
    $mail->SMTPSecure = $SMTP_SECURE;
    $mail->Port       = $SMTP_PORT;

    // Recipients
    $mail->setFrom($MAIL_FROM, $MAIL_FROM_NAME);
    $mail->addAddress($MAIL_TO);
    $mail->addReplyTo($email, $name);

    // Content
    $mail->isHTML(true);
    $mail->Subject = "New Mental Health Camp Registration — " . $name;

    $safeName  = htmlspecialchars($name, ENT_QUOTES);
    $safePhone = htmlspecialchars($phone, ENT_QUOTES);
    $safeEmail = htmlspecialchars($email, ENT_QUOTES);
    $safeType  = htmlspecialchars($type, ENT_QUOTES);
    $safeMsg   = nl2br(htmlspecialchars($msg, ENT_QUOTES));

    $mail->Body = "
        <h2>New Registration — Mental Health Camp</h2>
        <p><strong>Name:</strong> {$safeName}</p>
        <p><strong>Phone:</strong> {$safePhone}</p>
        <p><strong>Email:</strong> {$safeEmail}</p>
        <p><strong>Registering for:</strong> {$safeType}</p>
        <p><strong>Message:</strong><br>{$safeMsg}</p>
        <hr>
        <p style='color:#888;font-size:12px;'>Sent automatically from the Reboot Mental Health Center website.</p>
    ";
    $mail->AltBody = "New Registration\nName: {$name}\nPhone: {$phone}\nEmail: {$email}\nType: {$type}\nMessage: {$msg}";

    $mail->send();

    // Optional: also send a confirmation email back to the registrant
    $confirmation = new PHPMailer(true);
    $confirmation->isSMTP();
    $confirmation->Host       = $SMTP_HOST;
    $confirmation->SMTPAuth   = true;
    $confirmation->Username   = $SMTP_USERNAME;
    $confirmation->Password   = $SMTP_PASSWORD;
    $confirmation->SMTPSecure = $SMTP_SECURE;
    $confirmation->Port       = $SMTP_PORT;
    $confirmation->setFrom($MAIL_FROM, $MAIL_FROM_NAME);
    $confirmation->addAddress($email, $name);
    $confirmation->isHTML(true);
    $confirmation->Subject = "You're registered — Reboot Mental Health Camp";
    $confirmation->Body = "
        <p>Hi {$safeName},</p>
        <p>Thank you for registering for the Reboot Mental Health Camp ({$safeType}).
        We'll be in touch with your confirmation and venue details shortly.</p>
        <p>Date: 16th August, 2026 · 9:00 AM – 1:00 PM IST · In-Person, Tiruppur</p>
        <p>— Reboot Mental Health Center</p>
    ";
    $confirmation->send();

    echo json_encode(["success" => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Mailer error: " . $mail->ErrorInfo,
    ]);
}