// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockDEX} from "../src/MockDEX.sol";
import {Coliseum} from "../src/Coliseum.sol";

/// @notice Sanity check the deploy script logic without writing to disk or broadcasting.
contract DeployScriptTest is Test {
    function test_deploy_components_inline() public {
        // Simulate the same sequence as Deploy.run() but inline (no broadcast, no file write).
        address coordinator = address(0xC00);

        MockERC20 wmon = new MockERC20("Wrapped Monad", "WMON", 18);
        MockERC20 pit = new MockERC20("Pit Token", "PIT", 18);

        wmon.mint(address(this), 1_000_000 ether);
        pit.mint(address(this), 1_000_000 ether);

        MockDEX dexA = new MockDEX(address(wmon), address(pit));
        MockDEX dexB = new MockDEX(address(wmon), address(pit));

        wmon.approve(address(dexA), type(uint256).max);
        pit.approve(address(dexA), type(uint256).max);
        wmon.approve(address(dexB), type(uint256).max);
        pit.approve(address(dexB), type(uint256).max);

        dexA.addLiquidity(100_000 ether, 100_000 ether);
        dexB.addLiquidity(100_000 ether, 100_000 ether);

        (uint112 r0a, uint112 r1a) = dexA.getReserves();
        (uint112 r0b, uint112 r1b) = dexB.getReserves();
        assertEq(r0a, 100_000 ether);
        assertEq(r1a, 100_000 ether);
        assertEq(r0b, 100_000 ether);
        assertEq(r1b, 100_000 ether);

        Coliseum c = new Coliseum(coordinator);
        assertEq(c.owner(), coordinator);
        assertFalse(c.roundActive());
    }
}
