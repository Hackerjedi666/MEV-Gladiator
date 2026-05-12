// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Minimal ERC20 with permissionless mint() for hackathon testnet use.
/// @dev Do NOT deploy to mainnet. Anyone can mint to anyone.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @notice Permissionless mint. Testnet only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Permissionless burn from msg.sender.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
