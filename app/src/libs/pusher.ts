import crypto from "crypto";

// declare Pusher class with async send method
// Taken from https://github.com/pusher/pusher-http-node/issues/173
// REASON: works with edge deployments, which the official package does not
export class Pusher {
  private app_id: string;
  private key: string;
  private secret: string;
  private cluster: string;

  constructor(app_id: string, key: string, secret: string, cluster: string) {
    this.app_id = app_id;
    this.key = key;
    this.secret = secret;
    this.cluster = cluster;
  }

  /**
   * Triggers event on the channel
   * @param channel - channel name
   * @param event - event name
   * @param data - data to send, nedd to be JSON object or string
   */
  async trigger(channel: string, event: string, data: object | string) {
    const timestamp = (Date.now() / 1000) | 0;
    const body = JSON.stringify({
      name: event,
      data: typeof data === "string" ? data : JSON.stringify(data),
      channel: channel,
    });
    const md5 = this._md5(body);
    const signature = await this._createSignature(timestamp, body, md5);

    // Send event to pusher using fetch, use try/catch to handle errors
    try {
      await fetch(
        `https://api-${this.cluster}.pusher.com/apps/${this.app_id}/events?auth_key=${this.key}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${md5}&auth_signature=${signature}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
        }
      );
    } catch (error) {
      console.log("Error", error);
    }
  }
  private _md5(str: string) {
    return crypto.createHash("md5").update(str).digest("hex");
  }

  private async _createSignature(timestamp: number, body: string, md5: string) {
    const stringToSign = `POST\n/apps/${this.app_id}/events\nauth_key=${this.key}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${md5}`;
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(stringToSign);
    const encodedSecret = encoder.encode(this.secret);
    const importedKey = await crypto.subtle.importKey(
      "raw",
      encodedSecret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      { name: "HMAC", hash: "SHA-256" },
      importedKey,
      encodedData
    );
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureHex = signatureArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return signatureHex;
  }
}

export const getServerPusher = () => {
  const pusher = new Pusher(
    process.env.PUSHER_APP_ID,
    process.env.NEXT_PUBLIC_PUSHER_APP_KEY,
    process.env.PUSHER_APP_SECRET,
    process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER
  );
  return pusher;
};
