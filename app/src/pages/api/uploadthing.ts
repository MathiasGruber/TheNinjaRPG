import { createNextPageApiHandler } from "uploadthing/next-legacy";

import { ourFileRouter } from "../../server/uploadthing";
import { getAuth } from "@clerk/nextjs/server";
import type { NextApiRequest, NextApiResponse } from "next";

const handler = createNextPageApiHandler({
  router: ourFileRouter,
});

/** Why doing this? see: https://github.com/pingdotgg/uploadthing/issues/165 */
export default async function uploadthing(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = getAuth(req);
  if (userId) {
    // eslint-disable-next-line
    const body: any = req.body ? JSON.parse(req.body) : {};
    req.body = JSON.stringify({ ...body, userId });
  }
  await handler(req, res);
}
