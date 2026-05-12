// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PitMath} from "./lib/PitMath.sol";

/// @title MockDEX
/// @notice Minimal constant-product AMM with two tokens chosen at deploy time.
/// @dev 30 bps fee. No reentrancy guard by design (this is the pit; searchers race here).
contract MockDEX {
    /// @notice Tokens in this pool. Order is fixed at construction.
    address public immutable token0;
    address public immutable token1;

    /// @notice Current reserves. Updated on every swap and liquidity event.
    uint112 private reserve0;
    uint112 private reserve1;

    /// @notice Total LP shares outstanding.
    uint256 public totalShares;

    /// @notice LP shares per provider.
    mapping(address => uint256) public shares;

    /// @notice Min liquidity locked at first mint (UniswapV2-style).
    uint256 public constant MIN_LIQUIDITY = 1000;

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 shares);
    event Swap(
        address indexed sender, address indexed tokenIn, uint256 amountIn, uint256 amountOut, address indexed recipient
    );

    constructor(address _token0, address _token1) {
        require(_token0 != address(0) && _token1 != address(0), "MockDEX: ZERO_TOKEN");
        require(_token0 != _token1, "MockDEX: IDENTICAL_TOKENS");
        token0 = _token0;
        token1 = _token1;
    }

    /// @notice Current reserves.
    function getReserves() external view returns (uint112, uint112) {
        return (reserve0, reserve1);
    }

    /// @notice Quote amount out for a given amount in and direction.
    function quote(uint256 amountIn, address tokenIn) external view returns (uint256) {
        require(tokenIn == token0 || tokenIn == token1, "MockDEX: BAD_TOKEN");
        (uint256 rIn, uint256 rOut) =
            tokenIn == token0 ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
        return PitMath.getAmountOut(amountIn, rIn, rOut);
    }

    /// @notice Deposit both tokens, receive LP shares.
    /// @dev Caller must approve this contract for amount0 and amount1.
    function addLiquidity(uint256 amount0, uint256 amount1) external returns (uint256 sharesMinted) {
        require(amount0 > 0 && amount1 > 0, "MockDEX: ZERO_AMOUNT");
        _safeTransferFrom(token0, msg.sender, address(this), amount0);
        _safeTransferFrom(token1, msg.sender, address(this), amount1);

        if (totalShares == 0) {
            sharesMinted = PitMath.sqrt(amount0 * amount1);
            require(sharesMinted > MIN_LIQUIDITY, "MockDEX: INSUFFICIENT_INITIAL");
            // permanently lock MIN_LIQUIDITY to address(0)
            sharesMinted -= MIN_LIQUIDITY;
            totalShares = MIN_LIQUIDITY;
        } else {
            uint256 s0 = (amount0 * totalShares) / reserve0;
            uint256 s1 = (amount1 * totalShares) / reserve1;
            sharesMinted = PitMath.min(s0, s1);
            require(sharesMinted > 0, "MockDEX: ZERO_SHARES");
        }

        shares[msg.sender] += sharesMinted;
        totalShares += sharesMinted;

        reserve0 = _toU112(uint256(reserve0) + amount0);
        reserve1 = _toU112(uint256(reserve1) + amount1);

        emit LiquidityAdded(msg.sender, amount0, amount1, sharesMinted);
    }

    /// @notice Burn LP shares, withdraw proportional reserves.
    function removeLiquidity(uint256 sharesToBurn) external returns (uint256 amount0, uint256 amount1) {
        require(sharesToBurn > 0, "MockDEX: ZERO_SHARES");
        require(shares[msg.sender] >= sharesToBurn, "MockDEX: INSUFFICIENT_SHARES");

        amount0 = (sharesToBurn * reserve0) / totalShares;
        amount1 = (sharesToBurn * reserve1) / totalShares;
        require(amount0 > 0 && amount1 > 0, "MockDEX: ZERO_OUT");

        shares[msg.sender] -= sharesToBurn;
        totalShares -= sharesToBurn;

        reserve0 = _toU112(uint256(reserve0) - amount0);
        reserve1 = _toU112(uint256(reserve1) - amount1);

        _safeTransfer(token0, msg.sender, amount0);
        _safeTransfer(token1, msg.sender, amount1);

        emit LiquidityRemoved(msg.sender, amount0, amount1, sharesToBurn);
    }

    /// @notice Swap one token for the other. 30 bps fee.
    /// @param amountIn Amount of tokenIn to deposit.
    /// @param tokenIn Address of the input token (must be token0 or token1).
    /// @param minAmountOut Slippage guard.
    /// @param recipient Destination of the output token.
    function swap(uint256 amountIn, address tokenIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "MockDEX: ZERO_AMOUNT_IN");
        require(recipient != address(0), "MockDEX: ZERO_RECIPIENT");
        require(tokenIn == token0 || tokenIn == token1, "MockDEX: BAD_TOKEN");

        bool zeroForOne = tokenIn == token0;
        (uint256 rIn, uint256 rOut) =
            zeroForOne ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));

        amountOut = PitMath.getAmountOut(amountIn, rIn, rOut);
        require(amountOut >= minAmountOut, "MockDEX: SLIPPAGE");

        address tokenOut = zeroForOne ? token1 : token0;
        _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
        _safeTransfer(tokenOut, recipient, amountOut);

        if (zeroForOne) {
            reserve0 = _toU112(rIn + amountIn);
            reserve1 = _toU112(rOut - amountOut);
        } else {
            reserve1 = _toU112(rIn + amountIn);
            reserve0 = _toU112(rOut - amountOut);
        }

        emit Swap(msg.sender, tokenIn, amountIn, amountOut, recipient);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "MockDEX: TRANSFER_FAIL");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "MockDEX: TRANSFER_FROM_FAIL");
    }

    /// @dev Bounded downcast to uint112 with an explicit overflow check.
    function _toU112(uint256 x) private pure returns (uint112) {
        require(x <= type(uint112).max, "MockDEX: RESERVE_OVERFLOW");
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint112(x);
    }
}
