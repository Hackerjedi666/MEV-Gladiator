// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockDEX} from "../src/MockDEX.sol";

/// @notice Optional helper: introduce a price gap between DEX-A and DEX-B for arb-mode demos.
/// @dev Run with: forge script script/Drift.s.sol --rpc-url $MONAD_RPC_URL --broadcast --legacy
contract Drift is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        string memory json = vm.readFile("deployments/monad-testnet.json");
        address wmon = vm.parseJsonAddress(json, ".tokens.WMON");
        address pit = vm.parseJsonAddress(json, ".tokens.PIT");
        address dexA = vm.parseJsonAddress(json, ".dexes.DEX_A");

        uint256 driftAmount = 5_000 ether;

        vm.startBroadcast(pk);
        MockERC20(wmon).approve(dexA, type(uint256).max);
        uint256 out = MockDEX(dexA).swap(driftAmount, wmon, 0, vm.addr(pk));
        vm.stopBroadcast();

        console2.log("Drift swap on DEX-A:");
        console2.log("  in (WMON):", driftAmount);
        console2.log("  out (PIT):", out);
        // suppress unused warning
        pit;
    }
}
