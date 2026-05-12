// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @notice Mints tokens to victim + bots and prints balances.
/// @dev Reads addresses from /contracts/deployments/monad-testnet.json.
contract Seed is Script {
    uint256 internal constant SEED_PER_ACCOUNT = 100_000 ether;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        // Read deployment JSON
        string memory json = vm.readFile("deployments/monad-testnet.json");
        address wmon = vm.parseJsonAddress(json, ".tokens.WMON");
        address pit = vm.parseJsonAddress(json, ".tokens.PIT");
        console2.log("Deployer:", deployer);
        console2.log("WMON:", wmon);
        console2.log("PIT :", pit);

        // Read recipients
        address victim = vm.envAddress("VICTIM_PUBLIC_ADDRESS");
        string memory botsCsv = vm.envOr("BOT_ADDRESSES", string(""));
        address[] memory bots = _parseAddressList(botsCsv);

        console2.log("Victim:", victim);
        console2.log("Bot count:", bots.length);

        vm.startBroadcast(pk);

        // Mint to victim
        MockERC20(wmon).mint(victim, SEED_PER_ACCOUNT);
        MockERC20(pit).mint(victim, SEED_PER_ACCOUNT);
        console2.log("Seeded victim", victim);

        // Mint to each bot
        for (uint256 i = 0; i < bots.length; i++) {
            MockERC20(wmon).mint(bots[i], SEED_PER_ACCOUNT);
            MockERC20(pit).mint(bots[i], SEED_PER_ACCOUNT);
            console2.log("Seeded bot", bots[i]);
        }

        vm.stopBroadcast();

        // Print final balances
        console2.log("--- Final balances ---");
        _logBalances("victim", victim, wmon, pit);
        for (uint256 i = 0; i < bots.length; i++) {
            _logBalances("bot", bots[i], wmon, pit);
        }
    }

    function _logBalances(string memory label, address who, address wmon, address pit) internal view {
        console2.log(label, who);
        console2.log("  WMON:", MockERC20(wmon).balanceOf(who));
        console2.log("  PIT :", MockERC20(pit).balanceOf(who));
    }

    /// @dev Parse "0xabc,0xdef,0x123" into address[]. Empty input returns empty array.
    function _parseAddressList(string memory csv) internal pure returns (address[] memory out) {
        bytes memory b = bytes(csv);
        if (b.length == 0) return new address[](0);

        // First pass: count commas
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }

        out = new address[](count);
        uint256 idx = 0;
        uint256 start = 0;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                bytes memory piece = new bytes(i - start);
                for (uint256 j = 0; j < piece.length; j++) {
                    piece[j] = b[start + j];
                }
                out[idx++] = _parseAddr(string(piece));
                start = i + 1;
            }
        }
    }

    function _parseAddr(string memory s) internal pure returns (address) {
        bytes memory b = bytes(s);
        require(b.length == 42, "Seed: bad addr len");
        require(b[0] == "0" && (b[1] == "x" || b[1] == "X"), "Seed: missing 0x");
        uint160 acc = 0;
        for (uint256 i = 2; i < 42; i++) {
            acc = acc * 16 + uint160(_hexCharToInt(uint8(b[i])));
        }
        return address(acc);
    }

    function _hexCharToInt(uint8 c) internal pure returns (uint8) {
        if (c >= 0x30 && c <= 0x39) return c - 0x30;
        if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10;
        if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10;
        revert("Seed: bad hex");
    }
}
