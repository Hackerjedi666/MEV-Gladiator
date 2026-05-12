// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract MockERC20Test is Test {
    MockERC20 token;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        token = new MockERC20("Test", "TST", 18);
    }

    function test_metadata() public view {
        assertEq(token.name(), "Test");
        assertEq(token.symbol(), "TST");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 0);
    }

    function test_mint_permissionless() public {
        vm.prank(alice);
        token.mint(bob, 1_000 ether);
        assertEq(token.balanceOf(bob), 1_000 ether);
        assertEq(token.totalSupply(), 1_000 ether);
    }

    function test_mint_to_self() public {
        token.mint(address(this), 5 ether);
        assertEq(token.balanceOf(address(this)), 5 ether);
    }

    function test_burn() public {
        token.mint(address(this), 10 ether);
        token.burn(4 ether);
        assertEq(token.balanceOf(address(this)), 6 ether);
        assertEq(token.totalSupply(), 6 ether);
    }

    function test_transfer() public {
        token.mint(alice, 100 ether);
        vm.prank(alice);
        assertTrue(token.transfer(bob, 30 ether));
        assertEq(token.balanceOf(alice), 70 ether);
        assertEq(token.balanceOf(bob), 30 ether);
    }

    function test_decimals_custom() public {
        MockERC20 six = new MockERC20("Six", "SIX", 6);
        assertEq(six.decimals(), 6);
    }
}
