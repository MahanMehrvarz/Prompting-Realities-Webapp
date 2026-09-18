// Tutorials shown at /tutorials and /tutorials/[slug].
//
// To add one: append an entry here. The index page, the detail route and the
// home-page teaser all read from this array, so nothing else needs editing.
//
// Content of the first entry follows the workshop page at
// https://mahanmehrvarz.name/workshops/prompting-realities/ — code blocks,
// prompt instruction and JSON schema are reproduced verbatim from it.

export type TutorialBlock =
  | { kind: "text"; body: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; language: string; caption?: string; body: string };

export type TutorialStep = {
  /** Short label, e.g. "A" — keeps the workshop's own lettering. */
  marker: string;
  title: string;
  blocks: TutorialBlock[];
};

export type Tutorial = {
  slug: string;
  title: string;
  summary: string;
  /** One line for the card and the home-page teaser. */
  blurb: string;
  level: string;
  duration: string;
  context: string;
  requirements: string[];
  steps: TutorialStep[];
  resources: { label: string; href: string }[];
};

export const tutorials: Tutorial[] = [
  {
    slug: "your-first-llm-thing",
    title: "Your first LLM thing",
    blurb:
      "Wire a microcontroller to a language model and give a lamp a character it can answer for.",
    summary:
      "Wire a microcontroller kit to a language model, so a physical object can be given a character and answer for itself. You will connect a board to Wi-Fi, light a single NeoPixel LED, register an LLM thing on the Control Hub, and write the description and JSON schema that let a conversation drive the colour.",
    level: "No prior machine-learning experience needed",
    duration: "About half a day",
    context:
      "Run as a workshop by Mahan Mehrvarz for the Speculative Design Studio course, MSc Design for Interaction, TU Delft Industrial Design Engineering, 2025.",
    requirements: [
      "A Connected Interaction Kit board",
      "An OpenAI API key",
      "An MQTT broker account — shiftr.io is recommended",
      "A chainable NeoPixel LED",
    ],
    steps: [
      {
        marker: "A",
        title: "Connect the board to the internet",
        blocks: [
          {
            kind: "list",
            items: [
              "Connect the board to your computer over USB.",
              "Download and install the Mu editor from codewith.mu.",
              "On first run, select CircuitPython mode.",
            ],
          },
        ],
      },
      {
        marker: "B",
        title: "Quick test — light the NeoPixel LED",
        blocks: [
          {
            kind: "text",
            body: "Connect the chainable NeoPixel LED to pin D13, then load this into code.py on the board. Watch the serial output in Mu to confirm it subscribes to your topic.",
          },
          {
            kind: "code",
            language: "python",
            caption: "code.py",
            body: `# --- Imports
import time
import json
import board
import neopixel
from MQTT import Create_MQTT
from settings import settings

# --- Variables
# Configure the pin here (any NeoPixel-capable pin)
LED_PIN = board.D13
NUM_LEDS = 1

led = neopixel.NeoPixel(
    LED_PIN,
    NUM_LEDS,
    auto_write=False,
    pixel_order=neopixel.GRBW,
)

# Current LED state: "[R, G, B, Brightness]"
led_state = [255, 255, 255, 200]

# MQTT setup
client_id = settings["mqtt_clientid"]
mqtt_topic = settings.get("mqtt_topic")
mqtt_client = Create_MQTT(client_id)


# --- Functions
def apply_single_led(led_object, values):
    """Apply [R, G, B, Brightness] to a single NeoPixel object."""
    if not isinstance(values, list) or len(values) != 4:
        return

    r, g, b, brightness = values

    # Brightness 0-255 -> 0.0-1.0
    led_object.brightness = max(0.0, min(1.0, brightness / 255.0))

    # With pixel_order=neopixel.GRBW, we still pass (R, G, B, W)
    led_object.fill((r, g, b, 0))
    led_object.show()


def apply_led():
    """Apply current state to the single LED."""
    apply_single_led(led, led_state)


def on_message(client, topic, message):
    """Handle incoming MQTT messages to update the LED color."""
    global led_state
    try:
        data = json.loads(message)

        # Expect messages like: {"led": [R, G, B, Brightness]}
        if "led" in data and isinstance(data["led"], list) and len(data["led"]) == 4:
            led_state = data["led"]
            apply_led()
            print("Updated led:", led_state)
        else:
            print("Received invalid LED payload:", data)
    except Exception as e:
        print("Error parsing MQTT message:", e)


# --- Setup
# Clear LED first
led.fill((0, 0, 0, 0))
led.show()

# Apply initial state
apply_led()

# Configure MQTT callbacks and subscription
mqtt_client.on_message = on_message
mqtt_client.subscribe(mqtt_topic)
print("Subscribed to topic:", mqtt_topic)


# --- Main loop
while True:
    mqtt_client.loop(timeout=0.2)
    time.sleep(0.1)`,
          },
          {
            kind: "text",
            body: "Fill in your own Wi-Fi and broker credentials in settings.py. The topic is the string the board listens on and the one your LLM thing will publish to — they must match.",
          },
          {
            kind: "code",
            language: "python",
            caption: "settings.py",
            body: `settings ={
"ssid": "<your Wi-Fi network>",
"password": "<your Wi-Fi password>",
"mqtt_clientid": "<Your device name>",
"broker": "<your-namespace>.cloud.shiftr.io",
"mqtt_user": "<your broker username>",
"mqtt_password": "<your broker password>",
"mqtt_port": 1883,
"mqtt_topic": "RGBLight"
}`,
          },
        ],
      },
      {
        marker: "C",
        title: "Set up your Control Hub account",
        blocks: [
          {
            kind: "list",
            items: [
              "Sign up on the Control Hub — you will receive a magic link by email.",
              "Add a new LLM thing from the left panel.",
              "Configure its four tabs: Prompt Instruction, JSON Schema, MQTT, and OpenAI API Key.",
            ],
          },
        ],
      },
      {
        marker: "D",
        title: "Create your first LLM thing",
        blocks: [
          {
            kind: "text",
            body: "The prompt instruction is the whole programming step. It tells the model what the object is, what its numbers mean physically, and how to behave in conversation.",
          },
          {
            kind: "code",
            language: "text",
            caption: "Prompt Instruction",
            body: `You are sending values for a RGB LED to change its color based on the command or prompt from the user.
You send three values with each response.
R: for red
G: for green
B: for blue
X: the last value is the brightness
-Here is an example of the values inside the values object
{
  "led": [255, 100, 50, 200]
}

Ds:
-You cannot really do beyond this color change. If the user asked for other things be transparent.
-If user says something not about the LED. You can answer but don't change the color.

Do Not Do:
-in the response object do not include any technical term about the RGB values. Just refer to colors you created and engage the users in conversation.
-Don't be wordy keep it very short.`,
          },
          {
            kind: "text",
            body: "The schema is the contract. Every reply carries an answer for the person and an MQTT_value for the hardware — here a four-number array for red, green, blue and brightness.",
          },
          {
            kind: "code",
            language: "json",
            caption: "JSON Schema",
            body: `{
  "name": "led",
  "schema": {
    "type": "object",
    "required": [
      "answer",
      "MQTT_value"
    ],
    "properties": {
      "answer": {
        "type": "string"
      },
      "MQTT_value": {
        "type": "object",
        "required": [
          "led"
        ],
        "properties": {
          "led": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "maxItems": 4,
            "minItems": 4
          }
        },
        "additionalProperties": false
      }
    },
    "additionalProperties": false
  },
  "strict": true
}`,
          },
          {
            kind: "text",
            body: "Set the MQTT tab to your broker host, username, password, port 1883 and the same topic as settings.py. Add a valid OpenAI API key, save, and start the thing. Ask it for a colour and the lamp should answer.",
          },
        ],
      },
      {
        marker: "E",
        title: "Explore other actuators",
        blocks: [
          {
            kind: "text",
            body: "The pipeline does not change when the hardware does — only the description and the schema do. The examples folder in the GitHub repository covers a servo, a buzzer and a vibration motor.",
          },
        ],
      },
    ],
    resources: [
      {
        label: "Connected Interaction Kit documentation",
        href: "https://id-studiolab.github.io/Connected-Interaction-Kit/",
      },
      { label: "Mu editor — codewith.mu", href: "https://codewith.mu" },
      { label: "shiftr.io — MQTT broker", href: "https://shiftr.io" },
      {
        label: "Examples on GitHub",
        href: "https://github.com/MahanMehrvarz/PromptingRealities",
      },
      {
        label: "Original workshop page",
        href: "https://mahanmehrvarz.name/workshops/prompting-realities/",
      },
    ],
  },
];

export function getTutorial(slug: string) {
  return tutorials.find((t) => t.slug === slug);
}
