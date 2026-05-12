// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockDEX} from "../src/MockDEX.sol";
import {Coliseum} from "../src/Coliseum.sol";

/// @notice Deploy script for MEV Gladiator Pit.
/// @dev Writes /contracts/deployments/monad-testnet.json with a stable schema consumed by JS services.
contract Deploy is Script {
    uint256 internal constant INITIAL_LIQUIDITY = 100_000 ether;
    uint256 internal constant DEPLOYER_MINT = 1_000_000 ether;

    function run() external {
        address coordinator = vm.envAddress("COORDINATOR_PUBLIC_ADDRESS");
        require(coordinator != address(0), "Deploy: COORDINATOR_PUBLIC_ADDRESS unset");

        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("Deployer:", deployer);
        console2.log("Coordinator (Coliseum owner):", coordinator);

        vm.startBroadcast(pk);

        // 1. Tokens
        MockERC20 wmon = new MockERC20("Wrapped Monad", "WMON", 18);
        MockERC20 pit = new MockERC20("Pit Token", "PIT", 18);
        console2.log("WMON:", address(wmon));
        console2.log("PIT :", address(pit));

        // 2. Mint to deployer for initial liquidity
        wmon.mint(deployer, DEPLOYER_MINT);
        pit.mint(deployer, DEPLOYER_MINT);

        // 3. Two DEXs (A and B) on the same pair, for arb-mode drift
        MockDEX dexA = new MockDEX(address(wmon), address(pit));
        MockDEX dexB = new MockDEX(address(wmon), address(pit));
        console2.log("DEX-A:", address(dexA));
        console2.log("DEX-B:", address(dexB));

        // 4. Approve + seed initial liquidity in both DEXs
        wmon.approve(address(dexA), type(uint256).max);
        pit.approve(address(dexA), type(uint256).max);
        wmon.approve(address(dexB), type(uint256).max);
        pit.approve(address(dexB), type(uint256).max);

        dexA.addLiquidity(INITIAL_LIQUIDITY, INITIAL_LIQUIDITY);
        dexB.addLiquidity(INITIAL_LIQUIDITY, INITIAL_LIQUIDITY);
        console2.log("Initial liquidity seeded in both DEXs");

        // 5. Coliseum, owner = coordinator
        Coliseum coliseum = new Coliseum(coordinator);
        console2.log("Coliseum:", address(coliseum));

        vm.stopBroadcast();

        // 6. Write deployments JSON
        DeployArtifact memory a = DeployArtifact({
            chainId: block.chainid,
            deployedAt: block.timestamp,
            deployer: deployer,
            coordinator: coordinator,
            wmon: address(wmon),
            pit: address(pit),
            dexA: address(dexA),
            dexB: address(dexB),
            coliseum: address(coliseum)
        });
        string memory json = _buildDeploymentJson(a);
        string memory path = "deployments/monad-testnet.json";
        vm.writeFile(path, json);
        console2.log("Wrote", path);
    }

    /// @dev Grouped to dodge stack-too-deep in the JSON builder.
    struct DeployArtifact {
        uint256 chainId;
        uint256 deployedAt;
        address deployer;
        address coordinator;
        address wmon;
        address pit;
        address dexA;
        address dexB;
        address coliseum;
    }

    function _buildTokens(address wmon, address pit) internal returns (string memory) {
        string memory key = "tokens";
        vm.serializeAddress(key, "WMON", wmon);
        return vm.serializeAddress(key, "PIT", pit);
    }

    function _buildDexes(address dexA, address dexB) internal returns (string memory) {
        string memory key = "dexes";
        vm.serializeAddress(key, "DEX_A", dexA);
        return vm.serializeAddress(key, "DEX_B", dexB);
    }

    function _buildPair(address token0, address token1) internal returns (string memory) {
        string memory key = "pair";
        vm.serializeAddress(key, "token0", token0);
        return vm.serializeAddress(key, "token1", token1);
    }

    function _buildDeploymentJson(DeployArtifact memory a) internal returns (string memory) {
        // Stable schema. Keys must match @pit/shared DeploymentArtifact.
        string memory tokensOut = _buildTokens(a.wmon, a.pit);
        string memory dexesOut = _buildDexes(a.dexA, a.dexB);
        string memory pairOut = _buildPair(a.wmon, a.pit);

        string memory root = "root";
        vm.serializeUint(root, "schemaVersion", 1);
        vm.serializeUint(root, "chainId", a.chainId);
        vm.serializeUint(root, "deployedAt", a.deployedAt);
        vm.serializeAddress(root, "deployer", a.deployer);
        vm.serializeAddress(root, "coordinator", a.coordinator);
        vm.serializeAddress(root, "coliseum", a.coliseum);
        vm.serializeString(root, "tokens", tokensOut);
        vm.serializeString(root, "dexes", dexesOut);
        return vm.serializeString(root, "pair", pairOut);
    }
}
