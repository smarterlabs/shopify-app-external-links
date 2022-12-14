/*
  The custom REST API to support the app frontend.
  Handlers combine application data from qr-codes-db.js with helpers to merge the Shopify GraphQL Admin API data.
  The Shop is the Shop that the current user belongs to. For example, the shop that is using the app.
  This information is retrieved from the Authorization header, which is decoded from the request.
  The authorization header is added by App Bridge in the frontend code.
*/

import { Shopify } from "@shopify/shopify-api";
import {ScriptTag} from '@shopify/shopify-api/dist/rest-resources/2022-10/index.js';
// import Toast from '@shopify/app-bridge/actions/Toast/index.js';
import { QRCodesDB } from "../qr-codes-db.js";
import {
  getQrCodeOr404,
  getShopUrlFromSession,
  parseQrCodeBody,
  formatQrCodeResponse,
} from "../helpers/qr-codes.js";

const DISCOUNTS_QUERY = `
  query discounts($first: Int!) {
    codeDiscountNodes(first: $first) {
      edges {
        node {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
            ... on DiscountCodeBxgy {
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
            ... on DiscountCodeFreeShipping {
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export default function applyQrCodeApiEndpoints(app) {
  app.get("/api/discounts", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    if (!session) {
      res.status(401).send("Could not find a Shopify session");
      return;
    }

    const client = new Shopify.Clients.Graphql(
      session.shop,
      session.accessToken
    );

    /* Fetch all available discounts to list in the QR code form */
    const discounts = await client.query({
      data: {
        query: DISCOUNTS_QUERY,
        variables: {
          first: 25,
        },
      },
    });

    res.send(discounts.body.data);
  });

  app.get('/api/get-script', async (req, res) => {
    try {
      const session = await Shopify.Utils.loadCurrentSession(
        req,
        res,
        app.get("use-online-tokens")
      );

      if (!session) {
        res.status(401).send("Could not find a Shopify session");
        return;
      }

      // Toast.create(app, {
      //   duration: '1000',
      //   message: 'Hi! (quickly)'
      // });


      const scripts = await ScriptTag.all({
        session,
        since_id: "421379493",
      })

      console.log(`scripts`, scripts)

      // const client = new Shopify.Clients.Rest(session.shop, session.accessToken);

      // const script = await client.get({
      //   path: '/admin/api/2022-10/script_tags.json?since_id=421379493',
      //   // query: {
      //   //   src: 'https://unpkg.com/@livenetworks/external-links@1.0.1/ln-external-links.js'
      //   // }
      // });

      // console.log(`script`, script)

      // res.send(script.body);


      res.send('true');

    } catch (error) {
      // res.send(JSON.stringify(Object.keys(error)));
      res.status(500).send(error.message);
    }
  });

  // Edits theme script file
  app.post("/api/create-script", async (req, res) => {
    try {
      const session = await Shopify.Utils.loadCurrentSession(
        req,
        res,
        app.get("use-online-tokens")
      );

      if (!session) {
        res.status(401).send("Could not find a Shopify session");
        return;
      }

      const client = new Shopify.Clients.Rest(session.shop, session.accessToken);

      const response = await client.post({
        path: `admin/api/2021-01/script_tags.json`,
        data: {
          script_tag: {
            event: "onload",
            src: "https://unpkg.com/@livenetworks/external-links@1.0.1/ln-external-links.js",
          },
        },
      });

      res.send(response.body);
    } catch (error) {
      res.status(500).send(error.message);
    }
  })

  app.post("/api/qrcodes", async (req, res) => {
    try {
      const id = await QRCodesDB.create({
        ...(await parseQrCodeBody(req)),

        /* Get the shop from the authorization header to prevent users from spoofing the data */
        shopDomain: await getShopUrlFromSession(req, res),
      });
      const response = await formatQrCodeResponse(req, res, [
        await QRCodesDB.read(id),
      ]);
      res.status(201).send(response[0]);
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  app.patch("/api/qrcodes/:id", async (req, res) => {
    const qrcode = await getQrCodeOr404(req, res);

    if (qrcode) {
      try {
        await QRCodesDB.update(req.params.id, await parseQrCodeBody(req));
        const response = await formatQrCodeResponse(req, res, [
          await QRCodesDB.read(req.params.id),
        ]);
        res.status(200).send(response[0]);
      } catch (error) {
        res.status(500).send(error.message);
      }
    }
  });

  app.get("/api/qrcodes", async (req, res) => {
    try {
      const rawCodeData = await QRCodesDB.list(
        await getShopUrlFromSession(req, res)
      );

      const response = await formatQrCodeResponse(req, res, rawCodeData);
      res.status(200).send(response);
    } catch (error) {
      console.error(error);
      res.status(500).send(error.message);
    }
  });

  app.get("/api/qrcodes/:id", async (req, res) => {
    const qrcode = await getQrCodeOr404(req, res);

    if (qrcode) {
      const formattedQrCode = await formatQrCodeResponse(req, res, [qrcode]);
      res.status(200).send(formattedQrCode[0]);
    }
  });

  app.delete("/api/qrcodes/:id", async (req, res) => {
    const qrcode = await getQrCodeOr404(req, res);

    if (qrcode) {
      await QRCodesDB.delete(req.params.id);
      res.status(200).send();
    }
  });
}
