const protocolData = window.protocolData;
const erc20cTokenAbi = window.erc20cTokenAbi;
const comptrollerAbi = window.comptrollerAbi;
const networks = Object.keys(protocolData);
const cTokenEndpoint = 'https://api.compound.finance/api/v2/ctoken';
const infuraApiKey = '7db01e82204d4e789e22cf8e4f640ebe'
let web3;

const numbFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 18
}).format;

Array.prototype.forEachWithCallback = function(callback, final) {
  const arrayCopy = JSON.parse(JSON.stringify(this));
  let index = -1;
  const next = () => {
    index++;
    if (arrayCopy.length > 0) {
      callback(arrayCopy.shift(), index, next);
    } else {
      if (final) final();
    }
  }
  next();
}

const tableTemplate = Handlebars.compile(`
  <div class="max-width center">
    <h3>{{ name }}</h3>
    <div>
      <table class="table">
        <thead>
          <tr>
            <th>Attribute Name</th>
            <th>Attribute Value</th>
            <th>Member Name</th>
            <th>Member Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Current Exchange Rate</td>
            <td>{{ textExchangeRate }}</td>
            <td>exchangeRateCurrent</td>
            <td>{{ exchangeRateCurrent }}</td>
          </tr>
          <tr>
            <td>Contract Holdings</td>
            <td>{{ textContractHoldings }}</td>
            <td>liquidityPoolTotal</td>
            <td>{{ liquidityPoolTotal }}</td>
          </tr>
          <tr>
            <td>Open Borrows Sum</td>
            <td>{{ textOpenBorrows }}</td>
            <td>totalBorrowsCurrent</td>
            <td>{{ totalBorrowsCurrent }}</td>
          </tr>
          <tr>
            <td>Supply Rate / Block</td>
            <td>{{ textSupplyRate }}</td>
            <td>supplyRatePerBlock</td>
            <td>{{ supplyRatePerBlock }}</td>
          </tr>
          <tr>
            <td>Borrow Rate / Block</td>
            <td>{{ textBorrowRate }}</td>
            <td>borrowRatePerBlock</td>
            <td>{{ borrowRatePerBlock }}</td>
          </tr>
          <tr>
            <td>cTokens in Circulation</td>
            <td>{{ textCTokenCirculation }}</td>
            <td>totalSupply, decimals</td>
            <td>totalSupply / (1 * 10 ^ decimals)</td>
          </tr>
          <tr>
            <td>Total Reserves</td>
            <td>{{ textReservesSum }}</td>
            <td>totalReserves</td>
            <td>{{ totalReserves }}</td>
          </tr>
          <tr>
            <td>Reserve Factor</td>
            <td>{{ textReserveFactor }}</td>
            <td>reserveFactorMantissa</td>
            <td>{{ reserveFactor }}</td>
          </tr>
          <tr>
            <td>Collateral Factor</td>
            <td>{{ textCollateralFactor }}</td>
            <td>comptroller.markets</td>
            <td>{{ collateralFactor.collateralFactorMantissa }}</td>
          </tr>
          <tr>
            <td>Underlying Address</td>
            <td>{{ underlyingAddress }}</td>
            <td>underlying</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
`);

const networkTemplate = Handlebars.compile(`
  <h2 class="capitalize">{{ this }}</h2>
  <div id="{{ this }}">
    <div class="loading-table">
      <div class="loader"></div>
    </div>
    <div></div>
  </div>
`);

const assetTemplate = Handlebars.compile(`
  <div id="{{ this }}"></div>
`);

const scrollTop = document.getElementById('scroll-top');
scrollTop.onclick = () => { window.scrollTo(0, 0) };

window.addEventListener('load', async () => {
  const navigation = document.getElementById('navigation');
  const networksContainer = document.getElementById('networks-container');
  let networksHtml = '';
  networks.forEach((net) => {
    networksHtml += networkTemplate(net);
  });
  networksContainer.innerHTML = networksHtml;

  networks.forEach((net) => {
    const networkContainer = document.getElementById(net);
    const loadingElement = networkContainer.children[0];
    const tablesContainer = networkContainer.children[1];

    let tablesHtml = '';
    protocolData[net].cTokens.forEach((cToken, i) => {
      const symbol = cToken.symbol;
      tablesHtml += assetTemplate(`${net}-${symbol}`);
    });

    tablesContainer.innerHTML = tablesHtml;

    protocolData[net].cTokens.forEachWithCallback(async (cToken, index, done) => {
      const comptrollerAddr = protocolData[net].comptroller;
      const cTokenAddr = cToken.token_address;
      const symbol = cToken.symbol;
      try {
        const data = await getCTokenData(net, cTokenAddr, comptrollerAddr, symbol);
        data.name = cToken.name;
        loadingElement.classList.add('hidden');
        tablesContainer.children[`${net}-${symbol}`].innerHTML += tableTemplate(data);

        const nav = document.createElement("A");
        nav.href = `#${net}-${symbol}`
        nav.innerText = `${net} - ${symbol}`
        navigation.appendChild(nav);
        navigation.appendChild(document.createElement("BR"));
      } catch (e) {
        console.error(`${net} ${symbol}:`, e);
      }
      done();
    });
  });
});

const getCTokenData = (network, cTokenAddr, comptrollerAddr, symbol) => {
  return new Promise(async (resolve, reject) => {
    try {
      web3 = new Web3(`https://${network}.infura.io/v3/${infuraApiKey}`);
      const cToken = new web3.eth.Contract(erc20cTokenAbi, cTokenAddr);
      const comptroller = new web3.eth.Contract(comptrollerAbi, comptrollerAddr);

      const exchangeRateCurrent = await cToken.methods.exchangeRateCurrent().call();
      const liquidityPoolTotal  = await cToken.methods.getCash().call();
      const totalBorrowsCurrent = await cToken.methods.totalBorrowsCurrent().call();
      const borrowRatePerBlock  = await cToken.methods.borrowRatePerBlock().call();
      const totalSupply         = await cToken.methods.totalSupply().call();
      const supplyRatePerBlock  = await cToken.methods.supplyRatePerBlock().call();
      const totalReserves       = await cToken.methods.totalReserves().call();
      const reserveFactor       = await cToken.methods.reserveFactorMantissa().call();
      const collateralFactor    = await comptroller.methods.markets(cTokenAddr).call();
      const cTokenDecimals      = await cToken.methods.decimals().call();
      const cTokenMantissa      = parseFloat('1e'+cTokenDecimals);
      const underlyingAddress   = await cToken.methods.underlying().call();

      // const closeFactorMantissa = await comptroller.methods.closeFactorMantissa().call();
      // const liquidationIncentiveMantissa = await comptroller.methods.liquidationIncentiveMantissa().call();

      const result = {
        exchangeRateCurrent,
        liquidityPoolTotal,
        totalBorrowsCurrent,
        borrowRatePerBlock,
        totalSupply,
        supplyRatePerBlock,
        totalReserves,
        reserveFactor,
        collateralFactor,
        cTokenDecimals,
        underlyingAddress,
        textExchangeRate: `1 c${symbol} = ${numbFormat(exchangeRateCurrent / 1e18 / 1e10)} ${symbol}`,
        textContractHoldings: `${numbFormat(liquidityPoolTotal / 1e18)} ${symbol}`,
        textOpenBorrows: `${numbFormat(totalBorrowsCurrent / 1e18)} ${symbol}`,
        textSupplyRate: `${(supplyRatePerBlock / 1e18).toFixed(18)} ${symbol} per ${symbol} supplied`,
        textBorrowRate: `${(borrowRatePerBlock / 1e18).toFixed(18)} ${symbol} per ${symbol} borrowed`,
        textCTokenCirculation: `${numbFormat(totalSupply / cTokenMantissa)} c${symbol}`,
        textReservesSum: `${numbFormat(totalReserves / 1e18)} ${symbol}`,
        textReserveFactor: `${reserveFactor / 1e18 * 100}%`,
        textCollateralFactor: `${collateralFactor.collateralFactorMantissa / 1e18 * 100}%`,
        textcTokenMantissa: cTokenMantissa
      }

      console.log(`
        ~~ ${network} ~~ ${symbol} ~~
        Current Exchange Rate: ${result.textExchangeRate}
        ${symbol} in contract:       ${result.textContractHoldings}
        Open Borrows Sum:      ${result.textOpenBorrows}
        Supply Rate / Block:   ${result.textSupplyRate}
        Borrow Rate / Block:   ${result.textBorrowRate}
        c${symbol} in circulation:   ${result.textCTokenCirculation}
        Reserves:              ${result.textReservesSum}
        Reserve Factor:        ${result.textReserveFactor}
        Collateral Factor:     ${result.textCollateralFactor}
        cToken Mantissa:       ${cTokenMantissa}
        Underlying Address:    ${underlyingAddress}
      `);

      resolve(result);
    } catch (e) {
      reject(e);
    }
  });
};
