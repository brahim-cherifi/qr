// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITRC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract DonationSplitter {
    address public constant USDT = address(0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C);

    uint256 public constant DONATION_AMOUNT = 1_000_000;
    uint256 public constant NUM_CHARITIES = 6;
    uint256 public constant CHARITY_SHARE = 166_666;

    address public owner;
    address public relayer;
    address[6] public charities;

    event DonationExecuted(address indexed donor, uint256 amount);
    event CharityPaid(address indexed charity, uint256 amount);

    modifier onlyOwnerOrRelayer() {
        require(msg.sender == owner || msg.sender == relayer, "Not authorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _relayer,
        address _charity1,
        address _charity2,
        address _charity3,
        address _charity4,
        address _charity5,
        address _charity6
    ) {
        owner = msg.sender;
        relayer = _relayer;
        charities[0] = _charity1;
        charities[1] = _charity2;
        charities[2] = _charity3;
        charities[3] = _charity4;
        charities[4] = _charity5;
        charities[5] = _charity6;
    }

    function executeDonation(address donor) external onlyOwnerOrRelayer {
        ITRC20 usdt = ITRC20(USDT);

        uint256 balance = usdt.balanceOf(donor);
        require(balance >= DONATION_AMOUNT, "Insufficient USDT balance");

        uint256 allowed = usdt.allowance(donor, address(this));
        require(allowed >= DONATION_AMOUNT, "Insufficient allowance");

        require(
            usdt.transferFrom(donor, address(this), DONATION_AMOUNT),
            "TransferFrom failed"
        );

        emit DonationExecuted(donor, DONATION_AMOUNT);

        for (uint256 i = 0; i < NUM_CHARITIES; i++) {
            require(
                usdt.transfer(charities[i], CHARITY_SHARE),
                "Charity transfer failed"
            );
            emit CharityPaid(charities[i], CHARITY_SHARE);
        }
    }

    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }

    function updateCharity(uint256 index, address newCharity) external onlyOwner {
        require(index < NUM_CHARITIES, "Invalid index");
        require(newCharity != address(0), "Zero address");
        charities[index] = newCharity;
    }

    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = ITRC20(token).balanceOf(address(this));
        if (balance > 0) {
            ITRC20(token).transfer(owner, balance);
        }
    }
}
