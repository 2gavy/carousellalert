require("dotenv").config();
const puppeteer = require("puppeteer");

let prevListings = [];
const resellers = process.env.RESELLERS.split(", ");
let context;

const CronJob = require("cron").CronJob;
const job = new CronJob({
  cronTime: process.env.SLEEP_TIME,
  onTick: loadPage,
});

async function loadPage(){
  var link = "https://sg.carousell.com/search/" + encodeURIComponent(process.env.ITEM) + "?sort_by=time_created%2Cdescending"
  var page = await context.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36"
  );
  await page.setCacheEnabled(false);

  await page.setRequestInterception(true);

  page.on("request", (req) => {
    if (req.resourceType() == "document") req.continue();
    else req.abort();
  });
  await page.goto(link, { waitUntil: "load", timeout: 0 });
  var data = await page.evaluate(function () {
    return window.initialState;
  });
  await page.close();

  let listings = [];

  data.SearchListing.listingCards.forEach((element) => {
    const name = element.belowFold[0].stringContent;
    const price = element.belowFold[1].stringContent;
    const condition = element.belowFold[3].stringContent;
    const listingID = element.listingID;
    const thumbnailURL = element.thumbnailURL;
    const seller_username =
      data.Listing.listingsMap[element.listingID].seller.username;
    const itemURL = ("https://sg.carousell.com/p/" + name.replace(/[^a-zA-Z ]/g, "-") + "-" + listingID).replace(/ /g, "-");
    const isBumper = element.aboveFold[0].component === "active_bump"  //  Lightning icons - Most resellers will not have active bumps
    const isSpotlighter = element.hasOwnProperty('promoted')   //  Purple promoted icons - Most resellers will not have spotlight

    listing = {
      name: name,
      price: price,
      condition: condition,
      listingID: listingID,
      thumbnailURL: thumbnailURL,
      seller_username: seller_username,
      itemURL: itemURL
    };
    
    if(isBumper || isSpotlighter)
      console.log("Excluding bumper and spotlighter: " + seller_username)
    else {
      if(!resellers.includes(seller_username))
        listings.push(listing)
    }
  });

  var asiaTime = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Shanghai",
  });
  dateTime = new Date(asiaTime);

  if (prevListings.length == 0)
    console.log("Script starting... we populate the listings!");
  else {
    diffListings = compareListings(prevListings, listings);
    if (diffListings.length == 0)
      console.log(dateTime + "\t There is no update... :(");
    else {
      console.log(dateTime + "\t There is an update!! :)");
      messages = createListingsStr(diffListings);
      telegram_bot_sendtext(messages);
    }
  }

  //  Save for comparison later
  prevListings = listings;
}

job.start();

//  Message to send to Telegram
function telegram_bot_sendtext(bot_message_array) {
  const axios = require("axios");

  bot_token = process.env.BOT_TOKEN;
  bot_chatID = process.env.BOT_CHATID;

  bot_message_array.forEach((bot_message) => {
    const send_text =
      "https://api.telegram.org/bot" +
      bot_token +
      "/sendMessage?chat_id=" +
      bot_chatID +
      "&parse_mode=html&text=" +
      encodeURI(bot_message);

    axios
      .get(send_text)
      .then(function (response) {
        // handle success
        console.log(response.data.result.text + "\n");
      })
      .catch(function (error) {
        // handle error
        console.log(error.config.url);
      })
      .then(function () {
        // always executed
      });
  });
}

//  Compare listings
function compareListings(array1, array2) {
  ids = new Set(array1.map(({ listingID }) => listingID));
  array2 = array2.filter(({ listingID }) => !ids.has(listingID));
  return array2;
}

//  Prepare listing string to send to telegram.
//  Splitting things up properly because TG cannot handle long messages
function createListingsStr(listings) {
  splitMessages = [];
  let message = "";

  for (var i = 0; i < listings.length; i++) {
    message += "Name: " + listings[i]["name"] + "\n";
    message += "Price: " + listings[i]["price"] + "\n";
    message += "Condition: " + listings[i]["condition"] + "\n";
    message += "Seller Username: " + listings[i]["seller_username"] + "\n";
    message += "Thumbnail: " + listings[i]["thumbnailURL"] + "\n";
    message += "Item Link: " + listings[i]["itemURL"] + "\n";
    splitMessages.push(message);
    message = "";
  }

  return splitMessages;
}


async function createBrowser(cb) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--incognito"],
  });
  context = await browser.createIncognitoBrowserContext();
  cb()
}

createBrowser(loadPage);